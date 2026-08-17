const express = require('express');
const { authMiddleware, requireRole, requireTenant, extractRoleFromRequest } = require('../../shared/auth');
const { validateOrderBody, validateOrderStatus } = require('../../shared/validate');
const { sendEmail, buildOrderConfirmationEmail } = require('../../shared/email');
const log = require('../../shared/logger');
const { INVENTORY_URL, SHIPPING_URL } = require('../lib/service-urls');

// Roles that must NOT receive client_code in any response
const RESTRICTED_ROLES = new Set(['shipper', 'customer', 'vendor']);

function stripClientCode(rows) {
  rows.forEach(r => { delete r.client_code; });
  return rows;
}

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/orders', ordersRoutes({ pool, sendError, withTenantDb, resolveTenant })).
module.exports = function ordersRoutes({ pool, sendError, withTenantDb, resolveTenant }) {
  const router = express.Router();

  router.get('/test', (_req, res) => res.send('orders-service UP'));

  // Public tracking — only safe fields, no contact data. req.tenantSlug cae al
  // tenant por defecto si no viene header (ver resolveTenant).
  router.get('/track/:clientCode', async (req, res) => {
    try {
      const tenant = await resolveTenant(req.tenantSlug);
      if (!tenant) return res.status(404).json({ error: 'Código de cliente no encontrado' });
      const r = await pool.query(
        `SELECT o.id, o.sku, o.quantity, o.status, o.created_at, o.client_code, o.cancel_reason,
                c.name as customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.client_code = $1 AND o.tenant_id = $2`,
        [req.params.clientCode.toUpperCase(), tenant.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Código de cliente no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to track order', err); }
  });

  router.get('/report', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const status = req.query.status ? req.query.status.toUpperCase() : null;
      const r = await req.db.query('SELECT * FROM fn_get_orders_with_customer($1, $2)', [status, req.tenantId]);
      res.json(r.rows);
    } catch (err) { sendError(res, 500, 'Failed to get orders report', err); }
  });

  router.post('/', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
    try {
      const errors = validateOrderBody(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      const { customerId, sku, quantity } = req.body;
      const clientCode = 'SL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const order = (await req.db.query(
        "INSERT INTO orders (customer_id, sku, quantity, status, created_at, client_code, tenant_id) VALUES ($1,$2,$3,'CREATED',NOW(),$4,$5) RETURNING *",
        [customerId, sku, quantity, clientCode, req.tenantId])).rows[0];

      const customer = (await req.db.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [customerId, req.tenantId])).rows[0];
      const customerCode = order.client_code;

      if (customer && customer.email) {
        const { subject, html } = buildOrderConfirmationEmail({
          customerName: customer.name,
          orderId: order.id,
          sku: order.sku,
          quantity: order.quantity,
          customerCode
        });
        sendEmail({ to: customer.email, subject, html }).catch(() => {});
      }

      res.status(201).json({
        orderId: order.id, status: order.status, sku: order.sku,
        quantity: order.quantity, customerId: order.customer_id,
        message: 'Orden creada correctamente', createdAt: order.created_at,
        customerCode
      });
    } catch (err) { sendError(res, 500, 'Failed to create order', err); }
  });

  router.get('/', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const role = extractRoleFromRequest(req);
      const limit = req.query.limit ? Math.min(500, Math.max(1, parseInt(req.query.limit))) : null;
      const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
      let query = `SELECT o.*, c.name AS customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.tenant_id = $1
         ORDER BY o.created_at DESC`;
      const params = [req.tenantId];
      if (limit && page) {
        const offset = (page - 1) * limit;
        query += ' LIMIT $2 OFFSET $3';
        params.push(limit, offset);
      }
      const rows = (await req.db.query(query, params)).rows;
      if (RESTRICTED_ROLES.has(role)) stripClientCode(rows);
      res.json(rows);
    }
    catch (err) { sendError(res, 500, 'Failed to list orders', err); }
  });

  router.get('/:id', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const role = extractRoleFromRequest(req);
      const r = await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
      const row = r.rows[0];
      if (RESTRICTED_ROLES.has(role)) delete row.client_code;
      res.json(row);
    } catch (err) { sendError(res, 500, 'Failed to get order', err); }
  });

  router.put('/:id/status', authMiddleware, requireTenant, withTenantDb, requireRole('owner'), async (req, res) => {
    try {
      const statusErr = validateOrderStatus(req.query.status?.toUpperCase() || '');
      if (statusErr.length) return res.status(400).json({ error: statusErr.join(', ') });
      const result = await req.db.query('UPDATE orders SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [req.query.status.toUpperCase(), req.params.id, req.tenantId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json(result.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update status', err); }
  });

  // Saga de confirmacion (ver aidlc-docs/design-artifacts/ADR/ADR-001): sin
  // orquestador ni transacciones distribuidas reales, asi que la consistencia
  // se logra a mano. inventory solo se descuenta si el paso anterior no fallo,
  // y si shipping falla DESPUES de que el stock ya se desconto, se compensa
  // revirtiendo ese descuento (en vez de dejar stock reservado sin envio real).
  // Si la compensacion en si falla, la orden queda en CREATED igual (para
  // permitir reintentar) pero el warning marca que requiere revision manual,
  // porque en ese caso el stock puede haber quedado descontado sin envio.
  router.put('/:id/confirm', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
    const orderId = req.params.id;
    try {
      const order = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [orderId, req.tenantId])).rows[0];
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      const errors = [];

      let inventoryAdjusted = false;
      try {
        await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=-${order.quantity}`, { method: 'POST' });
        inventoryAdjusted = true;
      } catch (e) {
        log.error('Inventory adjustment failed', { orderId, message: e.message });
        errors.push(`Inventario: ${e.message}`);
      }

      let shipmentCreated = false;
      if (inventoryAdjusted) {
        try {
          await req.forwardedFetch(`${SHIPPING_URL}/api/shipments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: parseInt(orderId), customerId: order.customer_id, sku: order.sku, quantity: order.quantity }) });
          shipmentCreated = true;
        } catch (e) {
          log.error('Shipment creation failed', { orderId, message: e.message });
          errors.push(`Envío: ${e.message}`);
          try {
            await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=+${order.quantity}`, { method: 'POST' });
            log.warn('Stock compensado tras fallo de envío', { orderId });
          } catch (compErr) {
            log.error('Compensación de stock falló — requiere revisión manual', { orderId, message: compErr.message });
            errors.push(`Compensación de stock falló, requiere revisión manual: ${compErr.message}`);
          }
        }
      }

      const sagaOk = inventoryAdjusted && shipmentCreated;
      let updated = order;
      if (sagaOk) {
        await req.db.query("UPDATE orders SET status='EN_PREPARACION' WHERE id=$1 AND tenant_id=$2", [orderId, req.tenantId]);
        updated = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [orderId, req.tenantId])).rows[0];
      }
      log.info('Order confirm attempted', { orderId, sagaOk });
      res.json({ ...updated, warnings: errors.length ? errors : undefined });
    } catch (err) { sendError(res, 500, 'Failed to confirm order', err); }
  });

  router.put('/:id/cancel', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops', 'warehouse'), async (req, res) => {
    try {
      const order = (await req.db.query('SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId])).rows[0];
      if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
      const reason = (req.body.reason || '').substring(0, 255);

      if (order.status === 'EN_PREPARACION' || order.status === 'EN_REPARTO') {
        try { await req.forwardedFetch(`${INVENTORY_URL}/api/inventory/${order.sku}/adjust?delta=+${order.quantity}`, { method: 'POST' }); }
        catch (e) { log.error('Stock restore failed', { orderId: req.params.id, message: e.message }); }

        try {
          const shipmentResp = await req.forwardedFetch(`${SHIPPING_URL}/api/shipments/${order.id}`, { method: 'GET' });
          const shipment = await shipmentResp.json();
          if (shipment && shipment.id && shipment.status !== 'CANCELADO') {
            await req.forwardedFetch(`${SHIPPING_URL}/api/shipments/${shipment.id}/stage?stage=CANCELADO`, { method: 'PUT' });
            log.info('Linked shipment cancelled', { orderId: req.params.id, shipmentId: shipment.id });
          }
        } catch (e) { log.warn('Shipment cancel failed', { orderId: req.params.id, message: e.message }); }
      }

      const cancelled = (await req.db.query('SELECT * FROM fn_cancel_order($1,$2,$3)', [req.params.id, reason, req.tenantId])).rows[0];
      res.json(cancelled);
    } catch (err) { sendError(res, 500, 'Failed to cancel order', err); }
  });

  router.put('/:id/assign', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
    try {
      const transporter = (req.query.transporter || '').substring(0, 100);
      if (!transporter) return res.status(400).json({ error: 'transporter es requerido' });
      const result = await req.db.query('UPDATE orders SET assigned_to=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [transporter, req.params.id, req.tenantId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json(result.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to assign', err); }
  });

  router.delete('/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner'), async (req, res) => {
    try {
      const result = await req.db.query('DELETE FROM orders WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
      log.info('Order deleted', { orderId: req.params.id });
      res.json({ message: 'Orden eliminada correctamente', order: result.rows[0] });
    } catch (err) { sendError(res, 500, 'Failed to delete order', err); }
  });

  router.get('/:id/pdf', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const r = await req.db.query(
        `SELECT o.*, c.name AS customer_name, c.email AS customer_email,
                c.address AS customer_address, c.phone AS customer_phone, c.rut AS customer_rut
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id=$1 AND o.tenant_id=$2`,
        [req.params.id, req.tenantId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
      const order = r.rows[0];

      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=orden-${order.id}.pdf`);
      doc.pipe(res);

      doc.fontSize(22).fillColor('#0f172a').text('Logify', { align: 'center' });
      doc.fontSize(13).fillColor('#475569').text('Comprobante de Pedido', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#0f172a');
      doc.text(`Pedido #${order.id}`, { continued: true }).text(`  Estado: ${order.status}`, { align: 'right' });
      doc.text(`Fecha: ${new Date(order.created_at).toLocaleDateString('es-CL')}`, { continued: true });
      if (order.client_code) doc.text(`  Código: ${order.client_code}`, { align: 'right' });
      doc.moveDown();

      doc.fontSize(12).fillColor('#334155').text('Detalle del Pedido', { underline: true });
      doc.fontSize(11).fillColor('#0f172a');
      doc.text(`SKU: ${order.sku}`);
      doc.text(`Cantidad: ${order.quantity}`);
      if (order.assigned_to) doc.text(`Asignado a: ${order.assigned_to}`);
      doc.moveDown();

      doc.fontSize(12).fillColor('#334155').text('Cliente', { underline: true });
      doc.fontSize(11).fillColor('#0f172a');
      doc.text(`Nombre: ${order.customer_name || 'Sin asignar'}`);
      if (order.customer_rut) doc.text(`RUT: ${order.customer_rut}`);
      if (order.customer_email) doc.text(`Email: ${order.customer_email}`);
      if (order.customer_phone) doc.text(`Teléfono: ${order.customer_phone}`);
      if (order.customer_address) doc.text(`Dirección: ${order.customer_address}`);
      doc.moveDown(2);

      doc.fontSize(9).fillColor('#94a3b8').text('Documento generado por Logify — ' + new Date().toLocaleString('es-CL'), { align: 'center' });
      doc.end();
    } catch (err) { sendError(res, 500, 'PDF generation failed', err); }
  });

  return router;
};
