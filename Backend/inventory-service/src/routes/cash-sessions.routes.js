const express = require('express');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/cash-sessions', cashSessionsRoutes({ pool, sendError })).
module.exports = function cashSessionsRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/active', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT * FROM cash_sessions WHERE tenant_id=$1 AND vendor_id=$2 AND status='open' ORDER BY opened_at DESC LIMIT 1`,
        [req.tenantId, req.user?.sub]
      );
      res.json(r.rows[0] || null);
    } catch (err) { sendError(res, 500, 'Failed to get active cash session', err); }
  });

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try {
      const r = await pool.query(
        'SELECT * FROM cash_sessions WHERE tenant_id=$1 ORDER BY opened_at DESC LIMIT 100', [req.tenantId]
      );
      res.json(r.rows);
    } catch (err) { sendError(res, 500, 'Failed to list cash sessions', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'vendor'), async (req, res) => {
    try {
      const openingAmount = Number(req.body.openingAmount);
      if (!Number.isFinite(openingAmount) || openingAmount < 0) {
        return res.status(400).json({ error: 'openingAmount debe ser un número mayor o igual a 0' });
      }
      const existing = await pool.query(
        `SELECT 1 FROM cash_sessions WHERE tenant_id=$1 AND vendor_id=$2 AND status='open'`,
        [req.tenantId, req.user?.sub]
      );
      if (existing.rows.length) return res.status(409).json({ error: 'Ya tienes una caja abierta' });

      const session = (await pool.query(
        `INSERT INTO cash_sessions (tenant_id, vendor_id, vendor_name, opening_amount, opened_at, status)
         VALUES ($1,$2,$3,$4,NOW(),'open') RETURNING *`,
        [req.tenantId, req.user?.sub, req.user?.name || req.user?.sub, openingAmount]
      )).rows[0];
      res.status(201).json(session);
    } catch (err) { sendError(res, 500, 'Failed to open cash session', err); }
  });

  router.put('/:id/close', authMiddleware, requireTenant, requireRole('owner', 'vendor'), async (req, res) => {
    try {
      const countedAmount = Number(req.body.countedAmount);
      if (!Number.isFinite(countedAmount) || countedAmount < 0) {
        return res.status(400).json({ error: 'countedAmount debe ser un número mayor o igual a 0' });
      }
      const session = (await pool.query(
        `SELECT * FROM cash_sessions WHERE id=$1 AND tenant_id=$2 AND status='open'`,
        [req.params.id, req.tenantId]
      )).rows[0];
      if (!session) return res.status(404).json({ error: 'Sesión de caja no encontrada o ya cerrada' });

      const cashSales = (await pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM sales
         WHERE tenant_id=$1 AND vendor_id=$2 AND payment_method='cash' AND sale_date >= $3`,
        [req.tenantId, session.vendor_id, session.opened_at]
      )).rows[0];

      const expectedAmount = Number(session.opening_amount) + Number(cashSales.total);
      const difference = countedAmount - expectedAmount;

      // WHERE status='open' evita que dos cierres concurrentes de la misma sesion
      // (doble submit) pisen el resultado uno del otro -- solo el primero en
      // llegar la cierra, el segundo cae en el 404 de "ya cerrada" de arriba
      // en su proximo intento.
      const closed = (await pool.query(
        `UPDATE cash_sessions SET closed_at=NOW(), counted_amount=$1, expected_amount=$2, difference=$3, status='closed'
         WHERE id=$4 AND tenant_id=$5 AND status='open' RETURNING *`,
        [countedAmount, expectedAmount, difference, req.params.id, req.tenantId]
      )).rows[0];
      if (!closed) return res.status(404).json({ error: 'Sesión de caja no encontrada o ya cerrada' });
      res.json(closed);
    } catch (err) { sendError(res, 500, 'Failed to close cash session', err); }
  });

  return router;
};
