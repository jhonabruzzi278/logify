// Proteccion compartida para endpoints administrativos de plataforma
// (no hay panel de super-admin todavia, ver wiki/Multi-Tenant.md Fase 4E
// pendiente). Todos los servicios que necesiten un endpoint /api/admin/*
// deben usar este mismo middleware, protegido por el secreto compartido
// PLATFORM_ADMIN_KEY (mismo valor en los 4 servicios via docker-compose.prod.yml).
function requireAdminKey(req, res, next) {
  const configured = process.env.PLATFORM_ADMIN_KEY;
  if (!configured) return res.status(503).json({ error: 'PLATFORM_ADMIN_KEY no configurado' });
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: 'Clave de administración inválida' });
  }
  next();
}

// Handler generico de purga total para un tenant, reusado por
// inventory-service, shipping-service y notification-service (cada uno pasa
// su propio pool y lista de tablas tenant-scoped). orders-service llama a
// estos tres via HTTP y purga sus propias tablas por separado, ver
// DELETE /api/admin/tenants/:slug ahi.
function createTenantPurgeHandler(pool, tables, serviceLabel) {
  return async function purgeTenant(req, res) {
    const tenantId = Number.parseInt(req.params.tenantId, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ error: 'tenantId invalido' });
    }
    if (tenantId === 1) {
      return res.status(400).json({ error: 'No se puede purgar el tenant demo (id=1)' });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const counts = {};
      for (const table of tables) {
        const r = await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
        counts[table] = r.rowCount;
      }
      await client.query('COMMIT');
      res.json({ message: `${serviceLabel} purgado`, tenantId, counts });
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ error: 'Failed to purge tenant data' });
    } finally {
      if (client) client.release();
    }
  };
}

module.exports = { requireAdminKey, createTenantPurgeHandler };
