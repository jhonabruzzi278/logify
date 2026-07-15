const { createApp } = require('../shared/app');
const { validateInventoryBody, validateSaleBody } = require('../shared/validate');
const { authMiddleware } = require('../shared/auth');
const log = require('../shared/logger');

const { app, pool, sendError, start } = createApp('inventory_db', process.env.PORT || 8082);

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, stock INTEGER DEFAULT 0,
    name VARCHAR(200), price INTEGER DEFAULT 0, cost INTEGER DEFAULT 0,
    category VARCHAR(30) DEFAULT 'otros')`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku ON inventory (sku)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sales (id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, quantity INTEGER NOT NULL, sale_date TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (event_type VARCHAR(64) NOT NULL, event_key VARCHAR(128) NOT NULL, processed_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (event_type, event_key))`);
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name VARCHAR(200)`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'otros'`).catch(() => {});
  await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_group VARCHAR(50)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(100)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(200)`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price INTEGER DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`).catch(() => {});
}

async function ensureProcedures() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_adjust_stock(p_sku TEXT, p_delta INT)
    RETURNS TABLE(sku_out TEXT, new_stock INT, delta INT, success BOOLEAN, error_msg TEXT)
    AS $fn$
    DECLARE v_new_stock INT; v_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM inventory WHERE sku = p_sku) INTO v_exists;
      IF NOT v_exists THEN
        RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'SKU no encontrado'::TEXT; RETURN;
      END IF;
      UPDATE inventory SET stock = stock + p_delta WHERE sku = p_sku AND stock + p_delta >= 0 RETURNING stock INTO v_new_stock;
      IF v_new_stock IS NOT NULL THEN
        RETURN QUERY SELECT p_sku, v_new_stock, p_delta, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT p_sku, NULL::INT, p_delta, FALSE, 'Stock insuficiente'::TEXT;
      END IF;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION fn_get_inventory_report()
    RETURNS TABLE(sku VARCHAR, stock INT, stock_level TEXT)
    AS $fn$
    BEGIN
      RETURN QUERY
        SELECT i.sku, i.stock,
          CASE WHEN i.stock = 0 THEN 'SIN_STOCK' WHEN i.stock < 10 THEN 'CRITICO'
               WHEN i.stock < 30 THEN 'BAJO' ELSE 'NORMAL' END::TEXT
        FROM inventory i ORDER BY i.stock ASC;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
}

app.get('/api/inventory', authMiddleware, async (_req, res) => {
  try { res.json((await pool.query('SELECT * FROM inventory ORDER BY id')).rows); }
  catch (err) { sendError(res, 500, 'Failed to list inventory', err); }
});

app.get('/api/inventory/report', authMiddleware, async (_req, res) => {
  try { res.json((await pool.query('SELECT * FROM fn_get_inventory_report()')).rows); }
  catch (err) { sendError(res, 500, 'Failed to get inventory report', err); }
});

// ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

app.get('/api/inventory/report/pdf', authMiddleware, async (_req, res) => {
  try {
    const [items, report] = await Promise.all([
      pool.query('SELECT * FROM inventory ORDER BY id'),
      pool.query('SELECT * FROM fn_get_inventory_report()')
    ]);
    const levelMap = Object.fromEntries(report.rows.map(r => [r.sku, r.stock_level]));

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=inventario.pdf');
    doc.pipe(res);

    doc.fontSize(22).fillColor('#0f172a').text('SmartLogix', { align: 'center' });
    doc.fontSize(13).fillColor('#475569').text('Reporte de Inventario', { align: 'center' });
    doc.fontSize(9).fillColor('#94a3b8').text(`Generado: ${new Date().toLocaleString('es-CL')}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);

    const rows = items.rows;
    const sinStock = rows.filter(r => (levelMap[r.sku] || '') === 'SIN_STOCK').length;
    const critico = rows.filter(r => (levelMap[r.sku] || '') === 'CRITICO').length;
    const bajo = rows.filter(r => (levelMap[r.sku] || '') === 'BAJO').length;
    doc.fontSize(11).fillColor('#0f172a');
    doc.text(`Total SKUs: ${rows.length}   Sin stock: ${sinStock}   Crítico: ${critico}   Bajo: ${bajo}`);
    doc.moveDown();

    const colX = [50, 130, 260, 340, 400, 460];
    doc.fontSize(9).fillColor('#334155').font('Helvetica-Bold');
    doc.text('SKU', colX[0], doc.y, { width: 75 });
    doc.text('Nombre', colX[1], doc.y - doc.currentLineHeight(), { width: 125 });
    doc.text('Stock', colX[2], doc.y - doc.currentLineHeight(), { width: 75 });
    doc.text('Precio', colX[3], doc.y - doc.currentLineHeight(), { width: 55 });
    doc.text('Categoría', colX[4], doc.y - doc.currentLineHeight(), { width: 75 });
    doc.text('Nivel', colX[5], doc.y - doc.currentLineHeight(), { width: 60 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cbd5e1');
    doc.moveDown(0.3);

    doc.font('Helvetica').fillColor('#0f172a');
    for (const item of rows) {
      const level = levelMap[item.sku] || 'NORMAL';
      const color = level === 'SIN_STOCK' ? '#ef4444' : level === 'CRITICO' ? '#f97316' : level === 'BAJO' ? '#eab308' : '#22c55e';
      const y = doc.y;
      doc.fontSize(8);
      doc.text(item.sku, colX[0], y, { width: 75 });
      doc.text(item.name || '-', colX[1], y, { width: 125 });
      doc.text(String(item.stock), colX[2], y, { width: 75 });
      doc.text(`$${item.price}`, colX[3], y, { width: 55 });
      doc.text(item.category || '-', colX[4], y, { width: 75 });
      doc.fillColor(color).text(level, colX[5], y, { width: 60 });
      doc.fillColor('#0f172a');
      doc.moveDown(0.5);
    }

    doc.end();
  } catch (err) { sendError(res, 500, 'PDF failed', err); }
});

let indicadoresCache = { data: null, fetchedAt: 0 };
const INDICADORES_TTL_MS = 60 * 60 * 1000;

app.get('/api/inventory/indicadores', authMiddleware, async (_req, res) => {
  try {
    const now = Date.now();
    if (indicadoresCache.data && (now - indicadoresCache.fetchedAt) < INDICADORES_TTL_MS) {
      return res.json(indicadoresCache.data);
    }
    const response = await fetch('https://mindicador.cl/api');
    if (!response.ok) throw new Error(`mindicador.cl error ${response.status}`);
    const data = await response.json();
    const result = {
      uf: { valor: data.uf?.valor ?? null, fecha: data.uf?.fecha ?? null },
      dolar: { valor: data.dolar?.valor ?? null, fecha: data.dolar?.fecha ?? null },
      utm: { valor: data.utm?.valor ?? null, fecha: data.utm?.fecha ?? null }
    };
    indicadoresCache = { data: result, fetchedAt: now };
    res.json(result);
  } catch (err) { sendError(res, 500, 'Indicadores failed', err); }
});

app.get('/api/inventory/geocode', authMiddleware, async (req, res) => {
  try {
    const address = (req.query.address || '').trim();
    if (address.length < 3) return res.status(400).json({ error: 'address es requerido (mínimo 3 caracteres)' });
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Chile')}&format=json&addressdetails=1&limit=5&countrycodes=cl`;
    const response = await fetch(url, { headers: { 'User-Agent': 'SmartLogix/1.0 (logistica@smartlogix.cl)', 'Accept-Language': 'es' } });
    if (!response.ok) throw new Error(`Nominatim error ${response.status}`);
    const data = await response.json();
    res.json(data.map(r => ({
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      address: {
        road: r.address?.road,
        city: r.address?.city || r.address?.town || r.address?.village,
        state: r.address?.state,
        postcode: r.address?.postcode
      }
    })));
  } catch (err) { sendError(res, 500, 'Geocode failed', err); }
});

app.get('/api/inventory/image-search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'q debe tener al menos 2 caracteres' });
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&license_type=all`;
    const response = await fetch(url, { headers: { 'User-Agent': 'SmartLogix/1.0 (logistica@smartlogix.cl)' } });
    if (!response.ok) throw new Error(`Openverse error ${response.status}`);
    const data = await response.json();
    res.json((data.results || []).map(r => ({
      id: r.id,
      title: r.title,
      thumbnail: r.thumbnail,
      url: r.url,
      creator: r.creator,
      license: r.license
    })));
  } catch (err) { sendError(res, 500, 'Image search failed', err); }
});

app.put('/api/inventory/:sku/image', authMiddleware, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl es requerido' });
    const r = await pool.query('UPDATE inventory SET image_url=$1 WHERE sku=$2 RETURNING *', [imageUrl, req.params.sku]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update image', err); }
});

// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/inventory/:sku', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM inventory WHERE sku=$1', [req.params.sku]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to get inventory', err); }
});

app.post('/api/inventory', authMiddleware, async (req, res) => {
  try {
    const errors = validateInventoryBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });
    if ((await pool.query('SELECT 1 FROM inventory WHERE sku=$1', [req.body.sku])).rows.length)
      return res.status(409).json({ error: 'SKU ya existe' });
    const result = await pool.query(
      'INSERT INTO inventory (sku, stock, name, price, cost, category, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.body.sku, req.body.stock || 0, req.body.name || null, req.body.price || 0, req.body.cost || 0, req.body.category || 'otros', req.body.imageUrl || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to create inventory', err); }
});

app.put('/api/inventory/:sku', authMiddleware, async (req, res) => {
  try {
    if (req.body.stock === undefined || isNaN(Number(req.body.stock)) || Number(req.body.stock) < 0)
      return res.status(400).json({ error: 'stock must be >= 0' });
    const r = await pool.query('UPDATE inventory SET stock=$1 WHERE sku=$2 RETURNING *', [Number(req.body.stock), req.params.sku]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json(r.rows[0]);
  } catch (err) { sendError(res, 500, 'Failed to update inventory', err); }
});

app.delete('/api/inventory/:sku', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM inventory WHERE sku=$1 RETURNING *', [req.params.sku]);
    if (!r.rows.length) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json({ deleted: true, sku: req.params.sku });
  } catch (err) { sendError(res, 500, 'Failed to delete', err); }
});

app.get('/api/inventory/:sku/qr', authMiddleware, async (req, res) => {
  try {
    const { sku } = req.params;
    if (!(await pool.query('SELECT 1 FROM inventory WHERE sku=$1', [sku])).rows.length)
      return res.status(404).json({ error: 'SKU no encontrado' });
    const size = req.query.size || '200x200';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent('SMARTLOGIX-SKU:' + sku)}&format=png&margin=10`;
    const qrRes = await fetch(qrUrl);
    if (!qrRes.ok) throw new Error('QR service error');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await qrRes.arrayBuffer()));
  } catch (err) { sendError(res, 500, 'QR failed', err); }
});

app.post('/api/inventory/:sku/adjust', authMiddleware, async (req, res) => {
  try {
    const delta = parseInt(req.query.delta, 10);
    if (isNaN(delta) || delta === 0) return res.status(400).json({ error: 'delta must be non-zero integer' });
    const r = await pool.query('SELECT * FROM fn_adjust_stock($1,$2)', [req.params.sku, delta]);
    const result = r.rows[0];
    if (!result.success) {
      const status = result.error_msg === 'SKU no encontrado' ? 404 : 400;
      return res.status(status).json({ error: result.error_msg });
    }
    if (delta < 0) await pool.query('INSERT INTO sales (sku, quantity) VALUES ($1,$2)', [req.params.sku, Math.abs(delta)]);
    res.json({ sku: req.params.sku, stock: result.new_stock, delta });
  } catch (err) { sendError(res, 500, 'Failed to adjust stock', err); }
});

app.get('/api/sales', authMiddleware, async (_req, res) => {
  try { res.json((await pool.query('SELECT * FROM sales ORDER BY sale_date DESC')).rows); }
  catch (err) { sendError(res, 500, 'Failed to list sales', err); }
});

app.post('/api/sales', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validateSaleBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    if (req.body.items) {
      let saleItems;
      try {
        saleItems = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
      } catch {
        return res.status(400).json({ error: 'items debe ser un JSON valido' });
      }
      if (!Array.isArray(saleItems) || saleItems.length === 0) {
        return res.status(400).json({ error: 'items debe ser un arreglo no vacio' });
      }

      await client.query('BEGIN');

      // lock all rows first to prevent race conditions
      const insufficient = [];
      for (const item of saleItems) {
        if (!item.sku || !item.quantity || item.quantity < 1) {
          insufficient.push(`Item invalido: sku=${item.sku} qty=${item.quantity}`);
          continue;
        }
        const r = await client.query(
          'SELECT stock FROM inventory WHERE sku=$1 FOR UPDATE',
          [item.sku]
        );
        if (!r.rows.length) {
          insufficient.push(`SKU no encontrado: ${item.sku}`);
        } else if (r.rows[0].stock < item.quantity) {
          insufficient.push(`Stock insuficiente: ${item.sku} (disponible: ${r.rows[0].stock}, solicitado: ${item.quantity})`);
        }
      }

      if (insufficient.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: insufficient.join('; ') });
      }

      const saleGroup = `POS-${Date.now()}`;
      const results = [];

      for (const item of saleItems) {
        await client.query(
          'UPDATE inventory SET stock=stock-$1 WHERE sku=$2',
          [item.quantity, item.sku]
        );
        const sale = (await client.query(
          'INSERT INTO sales (sku, quantity, sale_group, payment_method, vendor_id, vendor_name, unit_price, total, sale_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *',
          [item.sku, item.quantity, saleGroup, req.body.paymentMethod || 'cash', req.body.vendorId || 'unknown', req.body.vendorName || '', item.unitPrice || 0, item.subtotal || 0]
        )).rows[0];
        results.push(sale);
      }

      await client.query('COMMIT');
      client.release();

      res.status(201).json({ saleGroup, items: results, total: req.body.total });
      return;
    }

    // single-item sale
    const r = await client.query(
      'UPDATE inventory SET stock=stock-$1 WHERE sku=$2 AND stock>=$1 RETURNING *',
      [req.body.quantity, req.body.sku]
    );
    if (!r.rows.length) {
      const exists = await client.query('SELECT 1 FROM inventory WHERE sku=$1', [req.body.sku]);
      client.release();
      return res.status(exists.rows.length ? 400 : 404).json({ error: exists.rows.length ? 'Stock insuficiente' : 'SKU no encontrado' });
    }
    const sale = (await client.query('INSERT INTO sales (sku, quantity) VALUES ($1,$2) RETURNING *', [req.body.sku, req.body.quantity])).rows[0];
    client.release();
    res.status(201).json(sale);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    sendError(res, 500, 'Failed to record sale', err);
  }
});

if (require.main === module) {
  (async () => { await ensureTables(); await ensureProcedures(); start(); })();
}

module.exports = { app };
