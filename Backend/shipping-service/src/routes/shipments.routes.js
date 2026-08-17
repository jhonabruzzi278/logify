const express = require('express');
const QRCode = require('qrcode');
const { validateShipmentBody, validateShipmentStage } = require('../../shared/validate');
const { sendEmail, buildShipmentUpdateEmail } = require('../../shared/email');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');
const log = require('../../shared/logger');
const { ORDERS_URL } = require('../lib/service-urls');
const { sendNotification } = require('../lib/notify');

function weatherDescription(code) {
  if (code === 0) return 'Despejado';
  if (code <= 3) return 'Parcialmente nublado';
  if (code <= 49) return 'Neblina';
  if (code <= 67) return 'Lluvia';
  if (code <= 77) return 'Nieve';
  if (code <= 82) return 'Chubascos';
  if (code <= 99) return 'Tormenta eléctrica';
  return 'Desconocido';
}

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/shipments', shipmentsRoutes({ pool, sendError })).
module.exports = function shipmentsRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM shipments WHERE tenant_id=$1 ORDER BY created_at DESC', [req.tenantId])).rows); }
    catch (err) { sendError(res, 500, 'Failed', err); }
  });

  router.get('/:orderId', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM shipments WHERE order_id=$1 AND tenant_id=$2', [req.params.orderId, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
    try {
      const errors = validateShipmentBody(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      const { orderId, sku, quantity } = req.body;
      const customerId = req.body.customerId || 0;
      if ((await pool.query('SELECT 1 FROM shipments WHERE order_id=$1 AND tenant_id=$2', [orderId, req.tenantId])).rows.length)
        return res.status(409).json({ error: `Ya existe envío para orden ${orderId}` });
      const tracking = 'TRACK-' + require('uuid').v4().substring(0, 8).toUpperCase();
      const shipment = (await pool.query(`INSERT INTO shipments (order_id,customer_id,sku,quantity,status,tracking_number,created_at,tenant_id) VALUES ($1,$2,$3,$4,'EN_PREPARACION',$5,NOW(),$6) RETURNING *`, [orderId, customerId, sku, quantity, tracking, req.tenantId])).rows[0];
      await sendNotification(req, shipment, 'SHIPMENT_CREATED', `Envío creado tracking ${tracking}`);
      res.status(201).json(shipment);
    } catch (err) { sendError(res, 500, 'Failed to create shipment', err); }
  });

  router.put('/:id/stage', authMiddleware, requireTenant, requireRole('owner', 'ops', 'warehouse', 'shipper'), async (req, res) => {
    try {
      const stageErr = validateShipmentStage((req.query.stage || '').toUpperCase());
      if (stageErr.length) return res.status(400).json({ error: stageErr.join(', ') });
      const stage = req.query.stage.toUpperCase();
      const shipment = (await pool.query('SELECT * FROM shipments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId])).rows[0];
      if (!shipment) return res.status(404).json({ error: 'Envío no encontrado' });

      let updated, notifStage, notifMsg;
      if (stage === 'EN_REPARTO') {
        updated = (await pool.query("UPDATE shipments SET status='EN_REPARTO',shipped_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *", [req.params.id, req.tenantId])).rows[0];
        notifStage = 'SHIPMENT_IN_TRANSIT'; notifMsg = `Envío en reparto - ${updated.tracking_number}`;
        try { await req.forwardedFetch(`${ORDERS_URL}/api/orders/${shipment.order_id}/status?status=EN_REPARTO`, { method: 'PUT' }); }
        catch (e) { log.warn('Order status sync failed', { orderId: shipment.order_id, message: e.message }); }
        if (shipment.customer_id && shipment.customer_id > 0) {
          try {
            const [orderRes, custRes] = await Promise.all([
              req.forwardedFetch(`${ORDERS_URL}/api/orders/${shipment.order_id}`),
              req.forwardedFetch(`${ORDERS_URL}/api/customers/${shipment.customer_id}`)
            ]);
            const [orderData, custData] = await Promise.all([orderRes.json(), custRes.json()]);
            if (custData && custData.email) {
              const { subject, html } = buildShipmentUpdateEmail({
                customerName: custData.name, orderId: shipment.order_id,
                clientCode: orderData.client_code, trackingCode: updated.tracking_number, stage
              });
              sendEmail({ to: custData.email, subject, html }).catch(() => {});
            }
          } catch (e) { log.warn('Email EN_REPARTO failed', { orderId: shipment.order_id, message: e.message }); }
        }
      } else if (stage === 'ENTREGADO') {
        const p = req.body || {};
        const normalizeRut = (r) => (r || '').replace(/[.\-\s]/g, '').toUpperCase();

        let orderData = null;
        let customerData = null;
        try {
          const orderRes = await req.forwardedFetch(`${ORDERS_URL}/api/orders/${shipment.order_id}`);
          if (orderRes.ok) orderData = await orderRes.json();
        } catch (e) { log.warn('Could not fetch order for validation', { orderId: shipment.order_id, message: e.message }); }

        if (orderData && orderData.client_code) {
          const expected = (orderData.client_code).toUpperCase().trim();
          const provided = (p.customerCode || '').toUpperCase().trim();
          if (provided !== expected) {
            return res.status(400).json({ error: 'Código de cliente incorrecto. Verifica el código proporcionado por el cliente.' });
          }
        }

        if (shipment.customer_id && shipment.customer_id !== 0) {
          try {
            const custRes = await req.forwardedFetch(`${ORDERS_URL}/api/customers/${shipment.customer_id}`);
            if (custRes.ok) customerData = await custRes.json();
          } catch (e) { log.warn('Could not fetch customer for validation', { customerId: shipment.customer_id, message: e.message }); }

          if (customerData && customerData.rut) {
            const expectedRut = normalizeRut(customerData.rut);
            const providedRut = normalizeRut(p.recipientRut);
            if (providedRut !== expectedRut) {
              return res.status(400).json({ error: 'RUT incorrecto. No coincide con el RUT del cliente registrado.' });
            }
          }
        }

        updated = (await pool.query("UPDATE shipments SET status='ENTREGADO',customer_code=$1,recipient_rut=$2,proof_of_delivery_image=$3 WHERE id=$4 AND tenant_id=$5 RETURNING *", [p.customerCode||'', p.recipientRut||'', p.proofOfDeliveryImage||null, req.params.id, req.tenantId])).rows[0];
        notifStage = 'SHIPMENT_DELIVERED'; notifMsg = `Envío entregado - ${updated.tracking_number}`;
        try { await req.forwardedFetch(`${ORDERS_URL}/api/orders/${shipment.order_id}/status?status=ENTREGADO`, { method: 'PUT' }); }
        catch (e) { log.warn('Order status sync failed', { orderId: shipment.order_id, message: e.message }); }
        if (customerData && customerData.email) {
          const { subject, html } = buildShipmentUpdateEmail({
            customerName: customerData.name, orderId: shipment.order_id,
            clientCode: orderData && orderData.client_code, trackingCode: updated.tracking_number, stage
          });
          sendEmail({ to: customerData.email, subject, html }).catch(e => log.warn('Email ENTREGADO failed', { orderId: shipment.order_id, message: e.message }));
        }
      } else {
        updated = (await pool.query('UPDATE shipments SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [stage, req.params.id, req.tenantId])).rows[0];
        notifStage = 'SHIPMENT_CANCELLED'; notifMsg = `Envío cancelado - ${updated.tracking_number}`;
        if (stage === 'CANCELADO') {
          try { await req.forwardedFetch(`${ORDERS_URL}/api/orders/${shipment.order_id}/status?status=CANCELADO`, { method: 'PUT' }); }
          catch (e) { log.warn('Order status sync failed', { orderId: shipment.order_id, message: e.message }); }
        }
      }
      await sendNotification(req, updated, notifStage, notifMsg);
      res.json(updated);
    } catch (err) { sendError(res, 500, 'Failed to change stage', err); }
  });

  router.get('/:id/qr', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM shipments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
      res.json({ qrCode: 'LOGIFY-' + r.rows[0].tracking_number });
    } catch (err) { sendError(res, 500, 'Failed', err); }
  });

  // ═══ EXTERNAL API ENDPOINTS ═══════════════════════════════════════════════════

  router.get('/:id/qr-image', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM shipments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
      const shipment = r.rows[0];
      const text = `LOGIFY-${shipment.tracking_number}`;
      const requestedSize = Number.parseInt(String(req.query.size || '').split('x')[0], 10);
      const size = Number.isFinite(requestedSize) ? Math.min(Math.max(requestedSize, 100), 1000) : 250;
      const png = await QRCode.toBuffer(text, { type: 'png', width: size, margin: 2, errorCorrectionLevel: 'M' });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(png);
    } catch (err) { sendError(res, 500, 'QR image failed', err); }
  });

  router.get('/:id/weather', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM shipments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
      const shipment = r.rows[0];

      let lat = parseFloat(req.query.lat) || -33.4489;
      let lon = parseFloat(req.query.lon) || -70.6693;

      if (!req.query.lat && shipment.customer_id && shipment.customer_id > 0) {
        try {
          const custRes = await req.forwardedFetch(`${ORDERS_URL}/api/customers/${shipment.customer_id}`);
          const customer = await custRes.json();
          if (customer.address) {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(customer.address + ', Chile')}&format=json&limit=1&countrycodes=cl`,
              { headers: { 'User-Agent': 'Logify/1.0' } }
            );
            const geoData = await geoRes.json();
            if (geoData.length) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon); }
          }
        } catch (e) { log.warn('Could not geocode for weather', { message: e.message }); }
      }

      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&wind_speed_unit=kmh&timezone=America%2FSantiago`;
      const weatherRes = await fetch(weatherUrl);
      if (!weatherRes.ok) throw new Error('Open-Meteo error');
      const data = await weatherRes.json();
      const current = data.current;
      const isAdverse = current.weather_code >= 51;

      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.tracking_number,
        location: { lat, lon },
        weather: {
          temperature: current.temperature_2m,
          humidity: current.relative_humidity_2m,
          precipitation: current.precipitation,
          windSpeed: current.wind_speed_10m,
          condition: weatherDescription(current.weather_code),
          weatherCode: current.weather_code
        },
        deliveryRisk: isAdverse ? 'ALTO' : 'BAJO',
        recommendation: isAdverse
          ? 'Condiciones adversas — considerar notificar al cliente sobre posible demora'
          : 'Condiciones normales para la entrega'
      });
    } catch (err) { sendError(res, 500, 'Weather failed', err); }
  });

  router.get('/:id/route', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM shipments WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
      const shipment = r.rows[0];

      const originLat = parseFloat(req.query.origin_lat) || -33.4489;
      const originLon = parseFloat(req.query.origin_lon) || -70.6693;
      let destLat = req.query.dest_lat ? parseFloat(req.query.dest_lat) : null;
      let destLon = req.query.dest_lon ? parseFloat(req.query.dest_lon) : null;

      if (!destLat && shipment.customer_id && shipment.customer_id > 0) {
        try {
          const custRes = await req.forwardedFetch(`${ORDERS_URL}/api/customers/${shipment.customer_id}`);
          const customer = await custRes.json();
          if (customer.address) {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(customer.address + ', Chile')}&format=json&limit=1&countrycodes=cl`,
              { headers: { 'User-Agent': 'Logify/1.0' } }
            );
            const geoData = await geoRes.json();
            if (geoData.length) { destLat = parseFloat(geoData[0].lat); destLon = parseFloat(geoData[0].lon); }
          }
        } catch (e) { log.warn('Could not geocode customer for route', { message: e.message }); }
      }

      if (!destLat || !destLon) {
        return res.status(400).json({ error: 'No se pudo determinar el destino. Pasa ?dest_lat=&dest_lon= o asegúrate que el cliente tiene dirección registrada.' });
      }

      const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(osrmUrl);
      if (!osrmRes.ok) throw new Error('OSRM error');
      const osrmData = await osrmRes.json();
      if (osrmData.code !== 'Ok') return res.status(400).json({ error: 'No se encontró ruta entre los puntos indicados' });

      const route = osrmData.routes[0];
      res.json({
        shipmentId: shipment.id,
        trackingNumber: shipment.tracking_number,
        distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
        durationMin: parseInt((route.duration / 60).toFixed(0)),
        origin: { lat: originLat, lon: originLon, label: 'Bodega Logify' },
        destination: { lat: destLat, lon: destLon },
        geometry: route.geometry
      });
    } catch (err) { sendError(res, 500, 'Route failed', err); }
  });

  return router;
};
