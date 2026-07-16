const webpush = require('web-push');
const { createApp } = require('../shared/app');
const { validateNotificationBody } = require('../shared/validate');
const { authMiddleware } = require('../shared/auth');
const log = require('../shared/logger');

const { app, pool, sendError, start } = createApp('notification_db', process.env.PORT || 8085);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:logistica@logify.cl', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_records (
    id SERIAL PRIMARY KEY, event_id VARCHAR(64) NOT NULL, order_id INTEGER NOT NULL,
    customer_id INTEGER DEFAULT 0, stage VARCHAR(40) NOT NULL, status VARCHAR(30) DEFAULT 'NOTIFIED',
    message VARCHAR(500) NOT NULL, target_audience VARCHAR(20) NOT NULL,
    source_service VARCHAR(50) DEFAULT 'external', occurred_at TIMESTAMP DEFAULT NOW(), received_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_order ON notification_records (order_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_audience ON notification_records (target_audience)`);
  await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uk_notif_event_audience') THEN ALTER TABLE notification_records ADD CONSTRAINT uk_notif_event_audience UNIQUE (event_id, target_audience); END IF; END $$`);
  await pool.query(`ALTER TABLE notification_records ALTER COLUMN customer_id DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE notification_records ALTER COLUMN status DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE notification_records ALTER COLUMN source_service DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE notification_records ALTER COLUMN occurred_at DROP NOT NULL`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    username VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`);
  await ensureTenantColumns();
}

// Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): backfill al
// tenant id=1 "logify", el mismo id fijo usado en las migraciones de los
// otros 3 servicios (no hay FK cross-database entre las 4 bases). El
// filtrado real de broadcastPush() por tenant_id llega en la Fase 4C
// (hoy push_subscriptions no distingue tenant al enviar, ver nota ahi).
async function ensureTenantColumns() {
  for (const table of ['notification_records', 'push_subscriptions']) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
    await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
  }
}

async function broadcastPush(payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const subs = (await pool.query('SELECT * FROM push_subscriptions')).rows;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]).catch(() => {});
      } else {
        log.warn('Push send failed', { message: err.message });
      }
    }
  }));
}

app.post('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const errors = validateNotificationBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    const e = req.body, audience = (e.audience || 'BOTH').toUpperCase();
    if ((await pool.query('SELECT 1 FROM notification_records WHERE event_id=$1 AND target_audience=$2', [e.eventId, audience])).rows.length)
      return res.status(409).json({ status: 'DUPLICATE', eventId: e.eventId });
    await pool.query(`INSERT INTO notification_records (event_id,order_id,customer_id,stage,status,message,target_audience,source_service,occurred_at,received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [e.eventId, e.orderId, e.customerId || 0, e.stage, e.status || 'NOTIFIED', e.message, audience, e.sourceService || 'external', e.occurredAt || new Date()]);
    broadcastPush({ title: e.stage.replace(/_/g, ' '), body: e.message, url: e.orderId ? `/orders/${e.orderId}` : '/notifications' }).catch(() => {});
    res.status(201).json({ status: 'ACCEPTED', eventId: e.eventId });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ status: 'DUPLICATE', eventId: req.body.eventId });
    sendError(res, 500, 'Failed', err);
  }
});

app.get('/api/notifications/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM notification_records WHERE order_id=$1 ORDER BY occurred_at ASC', [req.params.orderId])).rows;
    if (!rows.length) return res.status(404).json({ error: 'No hay notificaciones para esta orden' });
    res.json(rows);
  } catch (err) { sendError(res, 500, 'Failed', err); }
});

app.get('/api/notifications/audience/:audience', authMiddleware, async (req, res) => {
  try {
    const raw = req.params.audience.toUpperCase();
    const aliasMap = { CUSTOMER: 'CLIENT', CLIENTE: 'CLIENT' };
    const a = aliasMap[raw] || raw;
    if (!['CLIENT','OPERATOR','BOTH'].includes(a)) return res.status(400).json({ error: 'audience invalido. Valores: CLIENT, OPERATOR, BOTH' });
    res.json((await pool.query('SELECT * FROM notification_records WHERE target_audience=$1 ORDER BY occurred_at DESC', [a])).rows);
  } catch (err) { sendError(res, 500, 'Failed', err); }
});

app.post('/api/notifications/alert', authMiddleware, async (req, res) => {
  try {
    const { sku, name, stock, type, vendor } = req.body;
    if (!sku || stock === undefined) return res.status(400).json({ error: 'sku y stock son requeridos' });
    const eventId = `alert-${sku}-${Date.now()}`;
    const message = `${vendor || 'Vendedor'} reporta stock ${type === 'critical_stock' ? 'critico' : 'bajo'} en ${name || sku}: ${stock} unidades`;
    await pool.query(
      `INSERT INTO notification_records (event_id,order_id,stage,status,message,target_audience,source_service,occurred_at,received_at) VALUES ($1,0,'STOCK_ALERT','NOTIFIED',$2,'OPERATOR','frontend-alert',NOW(),NOW())`,
      [eventId, message]
    );
    broadcastPush({ title: 'Alerta de stock', body: message, url: '/inventory' }).catch(() => {});
    res.status(201).json({ status: 'ALERT_SENT', eventId, message });
  } catch (err) { sendError(res, 500, 'Failed', err); }
});

// ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

function weatherDesc(code) {
  if (code === 0) return 'Despejado';
  if (code <= 3) return 'Nublado';
  if (code <= 49) return 'Neblina';
  if (code <= 67) return 'Lluvia';
  if (code <= 77) return 'Nieve';
  if (code <= 82) return 'Chubascos';
  if (code <= 99) return 'Tormenta eléctrica';
  return 'Desconocido';
}

app.get('/api/notifications/weather-alert', authMiddleware, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || -33.4489;
    const lon = parseFloat(req.query.lon) || -70.6693;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&wind_speed_unit=kmh&timezone=America%2FSantiago`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) throw new Error('Open-Meteo error');
    const data = await weatherRes.json();
    const current = data.current;
    const isAdverse = current.weather_code >= 51;
    const condition = weatherDesc(current.weather_code);

    if (isAdverse) {
      const eventId = `weather-${Date.now()}`;
      const message = `Alerta climática: ${condition} — viento ${current.wind_speed_10m} km/h, precipitación ${current.precipitation} mm`;
      await pool.query(
        `INSERT INTO notification_records (event_id, order_id, stage, status, message, target_audience, source_service, occurred_at, received_at)
         VALUES ($1, 0, 'WEATHER_ALERT', 'NOTIFIED', $2, 'OPERATOR', 'open-meteo', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [eventId, message]
      );
      broadcastPush({ title: 'Alerta climática', body: message, url: '/notifications' }).catch(() => {});
      res.json({ alert: true, condition, message, weather: { temperature: current.temperature_2m, windSpeed: current.wind_speed_10m, precipitation: current.precipitation, weatherCode: current.weather_code }, location: { lat, lon }, eventId });
    } else {
      res.json({ alert: false, condition, message: 'Sin alertas climáticas activas', weather: { temperature: current.temperature_2m, windSpeed: current.wind_speed_10m, precipitation: current.precipitation, weatherCode: current.weather_code }, location: { lat, lon } });
    }
  } catch (err) { sendError(res, 500, 'Weather alert failed', err); }
});

app.get('/api/notifications/report/pdf', authMiddleware, async (_req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM notification_records ORDER BY occurred_at DESC LIMIT 200')).rows;
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=notificaciones.pdf');
    doc.pipe(res);

    doc.fontSize(22).fillColor('#0f172a').text('Logify', { align: 'center' });
    doc.fontSize(13).fillColor('#475569').text('Historial de Notificaciones', { align: 'center' });
    doc.fontSize(9).fillColor('#94a3b8').text(`Generado: ${new Date().toLocaleString('es-CL')} — Total: ${rows.length}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    doc.fontSize(9).fillColor('#0f172a');
    for (const n of rows) {
      const fecha = new Date(n.occurred_at).toLocaleString('es-CL');
      const audience = n.target_audience === 'OPERATOR' ? 'OPS' : n.target_audience === 'CLIENT' ? 'CLI' : 'AMB';
      doc.fillColor('#64748b').text(`${fecha}  [${audience}]  `, { continued: true });
      doc.fillColor('#0f172a').text(`${n.stage}`, { continued: true });
      if (n.order_id) doc.fillColor('#3b82f6').text(` #${n.order_id}`, { continued: true });
      doc.fillColor('#374151').text(`  ${n.message}`);
      doc.moveDown(0.2);
    }

    doc.end();
  } catch (err) { sendError(res, 500, 'PDF failed', err); }
});

app.get('/api/notifications/qr', authMiddleware, async (req, res) => {
  try {
    const text = (req.query.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text es requerido. Ej: ?text=LOGIFY-TRACK123' });
    const size = req.query.size || '200x200';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(text)}&format=png&margin=10`;
    const qrRes = await fetch(qrUrl);
    if (!qrRes.ok) throw new Error('QR service error');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(await qrRes.arrayBuffer()));
  } catch (err) { sendError(res, 500, 'QR failed', err); }
});

app.get('/api/notifications/push/vapid-public-key', authMiddleware, (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

app.post('/api/notifications/push/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'endpoint y keys son requeridos' });
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, username) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh=$2, auth=$3, username=$4`,
      [endpoint, keys.p256dh, keys.auth, req.user?.sub || null]
    );
    res.status(201).json({ subscribed: true });
  } catch (err) { sendError(res, 500, 'Failed to subscribe', err); }
});

app.delete('/api/notifications/push/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint es requerido' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [endpoint]);
    res.json({ unsubscribed: true });
  } catch (err) { sendError(res, 500, 'Failed to unsubscribe', err); }
});

// ══════════════════════════════════════════════════════════════════════════════

app.delete('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notification_records');
    log.info('Notification history cleared', { deletedCount: result.rowCount });
    res.json({ message: 'Historial de notificaciones vaciado', deletedCount: result.rowCount });
  } catch (err) { sendError(res, 500, 'Failed to clear notifications', err); }
});

if (require.main === module) {
  (async () => { await ensureTables(); start(); })();
}

module.exports = { app };
