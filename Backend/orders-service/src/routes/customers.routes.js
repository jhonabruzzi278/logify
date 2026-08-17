const express = require('express');
const { authMiddleware, requireRole, requireTenant } = require('../../shared/auth');
const { validateRutChileno } = require('../lib/rut');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/customers', customersRoutes({ sendError, withTenantDb })).
module.exports = function customersRoutes({ sendError, withTenantDb }) {
  const router = express.Router();

  router.get('/validate-rut', async (req, res) => {
    const { rut } = req.query;
    if (!rut) return res.status(400).json({ error: 'rut es requerido. Ej: ?rut=12345678-9' });
    res.json(validateRutChileno(rut));
  });

  router.get('/address-suggest', authMiddleware, requireTenant, async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (q.length < 3) return res.status(400).json({ error: 'q debe tener al menos 3 caracteres' });
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Chile')}&format=json&addressdetails=1&limit=5&countrycodes=cl`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Logify/1.0 (logistica@logify.cl)', 'Accept-Language': 'es' } });
      if (!response.ok) throw new Error(`Nominatim error ${response.status}`);
      const data = await response.json();
      res.json(data.map(item => ({
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        address: {
          road: item.address?.road,
          houseNumber: item.address?.house_number,
          city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality,
          state: item.address?.state,
          postcode: item.address?.postcode
        }
      })));
    } catch (err) { sendError(res, 500, 'Address suggest failed', err); }
  });

  router.get('/', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try { res.json((await req.db.query('SELECT * FROM customers WHERE tenant_id=$1 ORDER BY name', [req.tenantId])).rows); }
    catch (err) { sendError(res, 500, 'Failed to list customers', err); }
  });

  router.get('/:id', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const r = await req.db.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to get customer', err); }
  });

  router.post('/', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
    try {
      const { name, phone, address, email, rut, province, customerType, creditLimit } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const type = customerType === 'individual' ? 'individual' : 'company';
      const c = (await req.db.query(
        `INSERT INTO customers (name, phone, address, email, rut, province, customer_type, credit_limit, tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name.trim(), phone || null, address || null, email || null, rut || null, province || null,
         type, creditLimit != null && creditLimit !== '' ? Number(creditLimit) : null, req.tenantId])).rows[0];
      res.status(201).json(c);
    } catch (err) { sendError(res, 500, 'Failed to create customer', err); }
  });

  router.put('/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
    try {
      const { name, phone, address, email, rut, province, customerType, creditLimit } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const type = customerType === 'individual' ? 'individual' : 'company';
      const r = await req.db.query(
        `UPDATE customers SET name=$1, phone=$2, address=$3, email=$4, rut=$5, province=$6,
          customer_type=$7, credit_limit=$8 WHERE id=$9 AND tenant_id=$10 RETURNING *`,
        [name.trim(), phone || null, address || null, email || null, rut || null, province || null,
         type, creditLimit != null && creditLimit !== '' ? Number(creditLimit) : null, req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update customer', err); }
  });

  router.delete('/:id', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'ops'), async (req, res) => {
    try {
      const r = await req.db.query('DELETE FROM customers WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      res.json({ message: 'Cliente eliminado correctamente' });
    } catch (err) { sendError(res, 500, 'Failed to delete customer', err); }
  });

  // ═══ CUENTA CORRIENTE / FIADO ══════════════════════════════════════════════════

  router.get('/:id/credit', authMiddleware, requireTenant, withTenantDb, async (req, res) => {
    try {
      const customer = (await req.db.query(
        'SELECT id, credit_limit, credit_balance FROM customers WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId])).rows[0];
      if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
      const movements = (await req.db.query(
        'SELECT * FROM customer_credit_movements WHERE customer_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 100',
        [req.params.id, req.tenantId])).rows;
      res.json({ creditLimit: customer.credit_limit, creditBalance: customer.credit_balance, movements });
    } catch (err) { sendError(res, 500, 'Failed to get customer credit', err); }
  });

  async function applyCreditMovement(req, res, { type, sign }) {
    try {
      const amount = Number(req.body.amount);
      if (!amount || amount <= 0) return res.status(400).json({ error: 'amount debe ser un número mayor a 0' });
      const delta = sign * amount;
      const result = (await req.db.query(
        'SELECT * FROM fn_adjust_customer_credit($1,$2,$3)', [req.params.id, delta, req.tenantId])).rows[0];
      if (!result.success) {
        const status = result.error_msg === 'Cliente no encontrado' ? 404 : 400;
        return res.status(status).json({ error: result.error_msg });
      }
      const movement = (await req.db.query(
        `INSERT INTO customer_credit_movements
          (customer_id, tenant_id, type, amount, balance_after, reference_type, reference_id, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.params.id, req.tenantId, type, amount, result.new_balance,
         req.body.referenceType || null, req.body.referenceId || null, req.body.note || null, req.user?.sub || null]
      )).rows[0];
      res.status(201).json({ creditBalance: result.new_balance, movement });
    } catch (err) { sendError(res, 500, 'Failed to record credit movement', err); }
  }

  router.post('/:id/credit/charge', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin', 'vendor'), async (req, res) => {
    await applyCreditMovement(req, res, { type: 'charge', sign: 1 });
  });

  router.post('/:id/credit/payment', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin', 'vendor'), async (req, res) => {
    await applyCreditMovement(req, res, { type: 'payment', sign: -1 });
  });

  return router;
};
