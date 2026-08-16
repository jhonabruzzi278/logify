const express = require('express');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/suppliers', suppliersRoutes({ pool, sendError })).
module.exports = function suppliersRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM suppliers WHERE tenant_id=$1 ORDER BY name', [req.tenantId])).rows); }
    catch (err) { sendError(res, 500, 'Failed to list suppliers', err); }
  });

  router.get('/:id', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM suppliers WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to get supplier', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const { name, rut, phone, email, address } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const r = await pool.query(
        'INSERT INTO suppliers (name, rut, phone, email, address, tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [name.trim(), rut || null, phone || null, email || null, address || null, req.tenantId]);
      res.status(201).json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to create supplier', err); }
  });

  router.put('/:id', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const { name, rut, phone, email, address, active } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const r = await pool.query(
        'UPDATE suppliers SET name=$1, rut=$2, phone=$3, email=$4, address=$5, active=$6 WHERE id=$7 AND tenant_id=$8 RETURNING *',
        [name.trim(), rut || null, phone || null, email || null, address || null, active !== false, req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, 500, 'Failed to update supplier', err); }
  });

  router.delete('/:id', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    try {
      const r = await pool.query('DELETE FROM suppliers WHERE id=$1 AND tenant_id=$2 RETURNING *', [req.params.id, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
      res.json({ message: 'Proveedor eliminado correctamente' });
    } catch (err) { sendError(res, 500, 'Failed to delete supplier', err); }
  });

  return router;
};
