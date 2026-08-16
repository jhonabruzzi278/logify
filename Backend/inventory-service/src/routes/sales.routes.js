const express = require('express');
const { validateSaleBody } = require('../../shared/validate');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/sales', salesRoutes({ pool, sendError })).
module.exports = function salesRoutes({ pool, sendError }) {
  const router = express.Router();

  router.get('/', authMiddleware, requireTenant, async (req, res) => {
    try {
      const rows = (await pool.query(
        `SELECT s.*, i.name AS product_name
         FROM sales s LEFT JOIN inventory i ON i.sku = s.sku AND i.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
         ORDER BY s.sale_date DESC`, [req.tenantId])).rows;
      // Agrupa las filas por sale_group (una venta POS inserta una fila por item)
      const groups = new Map();
      for (const r of rows) {
        const key = r.sale_group || `sale-${r.id}`;
        if (!groups.has(key)) {
          groups.set(key, {
            id: r.id,
            items: [],
            total: 0,
            paymentMethod: r.payment_method || 'cash',
            vendorId: r.vendor_id || '',
            vendorName: r.vendor_name || '',
            customerId: r.customer_id || null,
            customerName: r.customer_name || null,
            createdAt: r.sale_date,
          });
        }
        const g = groups.get(key);
        const subtotal = r.total || (r.unit_price || 0) * r.quantity;
        g.items.push({
          sku: r.sku, name: r.product_name || r.sku, quantity: r.quantity, unitPrice: r.unit_price || 0, subtotal,
          unitCost: r.cost != null ? Number(r.cost) : null,
        });
        g.total += subtotal;
      }
      res.json(Array.from(groups.values()).map(g => ({ ...g, items: JSON.stringify(g.items) })));
    } catch (err) { sendError(res, 500, 'Failed to list sales', err); }
  });

  // Cierre de caja: desglose de ventas por método de pago para un día (por
  // defecto hoy) y, opcionalmente, un vendedor. No requiere stored procedure —
  // agregación simple sobre `sales`, mismo enfoque que GET /api/sales.
  router.get('/close-summary', authMiddleware, requireTenant, async (req, res) => {
    try {
      const date = req.query.date || new Date().toISOString().slice(0, 10);
      const params = [req.tenantId, date];
      let query = `
        SELECT COALESCE(payment_method, 'cash') AS payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE tenant_id = $1 AND sale_date::date = $2`;
      if (req.query.vendorId) {
        query += ' AND vendor_id = $3';
        params.push(req.query.vendorId);
      }
      query += ` GROUP BY COALESCE(payment_method, 'cash') ORDER BY payment_method`;
      const rows = (await pool.query(query, params)).rows;
      const summary = rows.map(r => ({ paymentMethod: r.payment_method, count: Number(r.count), total: Number(r.total) }));
      const grandTotal = summary.reduce((sum, r) => sum + r.total, 0);
      res.json({ date, summary, grandTotal });
    } catch (err) { sendError(res, 500, 'Failed to get close summary', err); }
  });

  router.post('/', authMiddleware, requireTenant, requireRole('owner', 'vendor'), async (req, res) => {
    const client = await pool.connect();
    const tenantId = req.tenantId;
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
        const costBySku = new Map();
        for (const item of saleItems) {
          if (!item.sku || !item.quantity || item.quantity < 1) {
            insufficient.push(`Item invalido: sku=${item.sku} qty=${item.quantity}`);
            continue;
          }
          // Líneas manuales (Agregar Monto, Descuento, Recargo del POS) no
          // corresponden a un producto real — no descuentan stock ni requieren
          // que el SKU exista en inventory.
          if (item.isManualAmount) continue;
          const r = await client.query(
            'SELECT stock, cost FROM inventory WHERE sku=$1 AND tenant_id=$2 FOR UPDATE',
            [item.sku, tenantId]
          );
          if (!r.rows.length) {
            insufficient.push(`SKU no encontrado: ${item.sku}`);
          } else if (r.rows[0].stock < item.quantity) {
            insufficient.push(`Stock insuficiente: ${item.sku} (disponible: ${r.rows[0].stock}, solicitado: ${item.quantity})`);
          } else {
            costBySku.set(item.sku, r.rows[0].cost);
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
          if (!item.isManualAmount) {
            await client.query(
              'UPDATE inventory SET stock=stock-$1 WHERE sku=$2 AND tenant_id=$3',
              [item.quantity, item.sku, tenantId]
            );
          }
          const sale = (await client.query(
            `INSERT INTO sales (sku, quantity, sale_group, payment_method, vendor_id, vendor_name,
              unit_price, total, customer_id, customer_name, cost, sale_date, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12) RETURNING *`,
            [item.sku, item.quantity, saleGroup, req.body.paymentMethod || 'cash', req.body.vendorId || 'unknown', req.body.vendorName || '',
             item.unitPrice || 0, item.subtotal || 0, req.body.customerId || null, req.body.customerName || null,
             costBySku.get(item.sku) ?? null, tenantId]
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
        'UPDATE inventory SET stock=stock-$1 WHERE sku=$2 AND tenant_id=$3 AND stock>=$1 RETURNING *',
        [req.body.quantity, req.body.sku, tenantId]
      );
      if (!r.rows.length) {
        const exists = await client.query('SELECT 1 FROM inventory WHERE sku=$1 AND tenant_id=$2', [req.body.sku, tenantId]);
        client.release();
        return res.status(exists.rows.length ? 400 : 404).json({ error: exists.rows.length ? 'Stock insuficiente' : 'SKU no encontrado' });
      }
      const sale = (await client.query('INSERT INTO sales (sku, quantity, tenant_id) VALUES ($1,$2,$3) RETURNING *', [req.body.sku, req.body.quantity, tenantId])).rows[0];
      client.release();
      res.status(201).json(sale);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      client.release();
      sendError(res, 500, 'Failed to record sale', err);
    }
  });

  return router;
};
