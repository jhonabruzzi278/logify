const express = require('express');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/purchases', purchasesRoutes({ pool, sendError })).
module.exports = function purchasesRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      const params = [req.tenantId];
      let query = `
        SELECT p.*, i.name AS product_name, i.unit_of_measure, s.name AS supplier_name
        FROM purchases p
        LEFT JOIN inventory i ON i.sku = p.sku AND i.tenant_id = p.tenant_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1`;
      if (q) {
        params.push(`%${q}%`);
        query += ` AND (i.name ILIKE $2 OR p.sku ILIKE $2 OR i.unit_of_measure ILIKE $2 OR p.created_by ILIKE $2)`;
      }
      query += ' ORDER BY p.purchased_at DESC';
      const rows = (await pool.query(query, params)).rows;
      res.json(rows);
    } catch (err) { sendError(res, 500, 'Failed to list purchases', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'warehouse'), async (req, res) => {
    const client = await pool.connect();
    try {
      const { sku, supplierId, unitCost, quantity, purchasedAt, updatePrices } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku es requerido' });
      if (!unitCost || Number(unitCost) <= 0) return res.status(400).json({ error: 'unitCost debe ser mayor a 0' });
      if (!quantity || Number(quantity) < 1) return res.status(400).json({ error: 'quantity debe ser mayor o igual a 1' });

      await client.query('BEGIN');
      const product = (await client.query(
        'SELECT sku FROM inventory WHERE sku=$1 AND tenant_id=$2 FOR UPDATE', [sku, req.tenantId]
      )).rows[0];
      if (!product) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'SKU no encontrado' });
      }

      const subtotal = Number(unitCost) * Number(quantity);
      await client.query('UPDATE inventory SET stock = stock + $1 WHERE sku=$2 AND tenant_id=$3', [Number(quantity), sku, req.tenantId]);
      if (updatePrices) {
        await client.query('UPDATE inventory SET cost=$1 WHERE sku=$2 AND tenant_id=$3', [Number(unitCost), sku, req.tenantId]);
      }
      const purchase = (await client.query(
        `INSERT INTO purchases (tenant_id, sku, supplier_id, unit_cost, quantity, subtotal, update_prices, purchased_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.tenantId, sku, supplierId || null, Number(unitCost), Number(quantity), subtotal, updatePrices === true,
         purchasedAt ? new Date(purchasedAt) : new Date(), req.user?.sub || null]
      )).rows[0];

      await client.query('COMMIT');
      res.status(201).json(purchase);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      sendError(res, 500, 'Failed to record purchase', err);
    } finally {
      client.release();
    }
  });

  return router;
};
