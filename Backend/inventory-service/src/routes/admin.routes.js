const express = require('express');
const { requireAdminKey } = require('../../shared/admin');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/admin', adminRoutes({ pool, sendError })).
module.exports = function adminRoutes({ pool, sendError }) {
  const router = express.Router();

  // Purga total de un tenant (llamada internamente por orders-service al
  // eliminar una empresa completa, ver DELETE /api/admin/tenants/:slug ahi).
  // Protegida con el mismo PLATFORM_ADMIN_KEY -- ver shared/admin.js. La
  // estructura se repite en shipping-service/notification-service a
  // proposito (sonar.cpd.exclusions en sonar-project.properties): cada
  // servicio tiene su propia base de datos (Postgres no permite FK
  // cross-database) y su propia lista de tablas tenant-scoped, asi que no
  // hay una abstraccion real que compartir sin sacrificar la cobertura de
  // tests (Jest no instrumenta codigo fuera del rootDir de cada servicio).
  router.delete('/tenants/:tenantId/purge', requireAdminKey, async (req, res) => {
    const tenantId = Number.parseInt(req.params.tenantId, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return res.status(400).json({ error: 'tenantId invalido' });
    if (tenantId === 1) return res.status(400).json({ error: 'No se puede purgar el tenant demo (id=1)' });
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const counts = {};
        for (const table of ['sales', 'purchases', 'cash_sessions', 'processed_events', 'inventory', 'suppliers']) {
          const r = await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
          counts[table] = r.rowCount;
        }
        await client.query('COMMIT');
        res.json({ message: 'inventory-service purgado', tenantId, counts });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { sendError(res, 500, 'Failed to purge tenant data', err); }
  });

  return router;
};
