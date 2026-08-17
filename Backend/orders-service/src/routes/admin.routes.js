const express = require('express');
const { requireAdminKey } = require('../../shared/admin');
const { validatePasswordStrength } = require('../security-module');
const { DEFAULT_TENANT_SLUG } = require('../lib/tenant');
const { INVENTORY_URL, SHIPPING_URL, NOTIFICATION_URL } = require('../lib/service-urls');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/admin', adminRoutes({ pool, sendError, resolveTenant })).
module.exports = function adminRoutes({ pool, sendError, resolveTenant }) {
  const router = express.Router();

  // ═══ ADMIN DE CUPONES (Fase 4E) ═══════════════════════════════════════════════════
  // No hay rol de super-admin en el sistema todavia (ver wiki/Multi-Tenant.md,
  // Fase 4E pendiente: panel de super-admin). Mientras tanto, estos endpoints
  // se protegen con un secreto compartido de plataforma via header (ver
  // shared/admin.js), pensados para gestionarse por curl/Postman, no por UI.
  router.post('/coupons', requireAdminKey, async (req, res) => {
    try {
      const { code, extraTrialDays, maxRedemptions, expiresAt } = req.body;
      if (!code || !code.trim()) return res.status(400).json({ error: 'El código es obligatorio' });
      const coupon = (await pool.query(
        `INSERT INTO coupons (code, extra_trial_days, max_redemptions, expires_at)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [code.trim().toUpperCase(), extraTrialDays || 90, maxRedemptions || null, expiresAt || null]
      )).rows[0];
      res.status(201).json(coupon);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un cupón con ese código' });
      sendError(res, 500, 'Failed to create coupon', err);
    }
  });

  // Recuperacion de tenants bloqueados (ver postmortem
  // 2026-08-07-admin-autoeliminacion.md): si el unico admin de un tenant se
  // elimina a si mismo (bug ya corregido, pero esto recupera cuentas ya
  // afectadas) no hay panel de super-admin para recrearlo. Este endpoint
  // crea o resetea un usuario 'owner' para un tenant via su slug, protegido
  // con el mismo PLATFORM_ADMIN_KEY que /api/admin/coupons.
  router.post('/tenants/:slug/reset-owner', requireAdminKey, async (req, res) => {
    try {
      const { username, password, name } = req.body;
      if (!username?.trim()) return res.status(400).json({ error: 'El usuario es obligatorio' });
      if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
      const passwordErrors = validatePasswordStrength(password);
      if (passwordErrors.length) return res.status(400).json({ error: passwordErrors.join('. ') });

      const tenant = await resolveTenant(req.params.slug);
      if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

      const bcrypt = require('bcryptjs');
      const usernameNorm = username.trim().toLowerCase();
      const hash = await bcrypt.hash(password, 10);
      const existing = (await pool.query('SELECT id FROM users WHERE username=$1 AND tenant_id=$2', [usernameNorm, tenant.id])).rows[0];

      let user, created;
      if (existing) {
        user = (await pool.query(
          `UPDATE users SET password_hash=$1, role='owner', name=$2, updated_at=NOW() WHERE id=$3
           RETURNING id, username, name, role`,
          [hash, name.trim(), existing.id]
        )).rows[0];
        created = false;
      } else {
        user = (await pool.query(
          `INSERT INTO users (username, password_hash, name, role, tenant_id)
           VALUES ($1,$2,$3,'owner',$4) RETURNING id, username, name, role`,
          [usernameNorm, hash, name.trim(), tenant.id]
        )).rows[0];
        created = true;
      }
      res.status(created ? 201 : 200).json({ message: created ? 'Owner creado' : 'Owner actualizado', user, tenantSlug: tenant.slug });
    } catch (err) { sendError(res, 500, 'Failed to reset tenant owner', err); }
  });

  // Eliminacion completa e irreversible de un tenant y todos sus datos. Los 4
  // microservicios tienen bases de datos separadas (Postgres no soporta FK
  // cross-database, ver Backend/shared/app.js), asi que este endpoint orquesta
  // la purga en inventory-service, shipping-service y notification-service via
  // HTTP interno antes de borrar los datos propios de orders-service y,
  // finalmente, la fila de tenants. No hay soft-delete ni papelera: pensado
  // para gestionarse por curl con el mismo PLATFORM_ADMIN_KEY, requiriendo
  // re-escribir el slug en el body como confirmacion extra (un typo en la URL
  // no alcanza para borrar el tenant equivocado).
  router.delete('/tenants/:slug', requireAdminKey, async (req, res) => {
    const slug = (req.params.slug || '').trim().toLowerCase();
    try {
      if (slug === DEFAULT_TENANT_SLUG) {
        return res.status(400).json({ error: 'No se puede eliminar el tenant demo de la plataforma' });
      }
      if (req.body?.confirmSlug !== slug) {
        return res.status(400).json({ error: 'Falta confirmar: confirmSlug en el body debe ser igual al slug de la URL' });
      }
      const tenant = await resolveTenant(slug);
      if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

      const adminKey = process.env.PLATFORM_ADMIN_KEY;
      const remoteServices = [
        { name: 'inventory-service', url: `${INVENTORY_URL}/api/admin/tenants/${tenant.id}/purge` },
        { name: 'shipping-service', url: `${SHIPPING_URL}/api/admin/tenants/${tenant.id}/purge` },
        { name: 'notification-service', url: `${NOTIFICATION_URL}/api/admin/tenants/${tenant.id}/purge` },
      ];
      const purged = {};
      for (const { name, url } of remoteServices) {
        let response;
        try {
          response = await fetch(url, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
        } catch (err) {
          return res.status(502).json({ error: `No se pudo contactar a ${name}: ${err.message}`, purgedSoFar: purged });
        }
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          return res.status(502).json({ error: `Fallo al purgar ${name}: HTTP ${response.status} ${body}`, purgedSoFar: purged });
        }
        purged[name] = await response.json().catch(() => ({}));
      }

      // Todos los servicios remotos purgaron OK -- recien ahora se tocan los
      // datos locales (orden inverso al del reintento: si esto fallara, el
      // DELETE completo es reintentable porque los DELETE WHERE tenant_id=$1
      // de arriba son idempotentes).
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const localCounts = {};
        for (const table of ['customer_credit_movements', 'orders', 'customers', 'user_invitations', 'users', 'coupon_redemptions']) {
          const r = await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant.id]);
          localCounts[table] = r.rowCount;
        }
        await client.query('DELETE FROM tenants WHERE id=$1', [tenant.id]);
        await client.query('COMMIT');
        res.json({ message: 'Tenant eliminado completamente', tenantSlug: slug, purged: { ...purged, 'orders-service': localCounts } });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { sendError(res, 500, 'Failed to delete tenant', err); }
  });

  router.get('/coupons', requireAdminKey, async (req, res) => {
    try {
      const rows = (await pool.query('SELECT * FROM coupons ORDER BY created_at DESC')).rows;
      res.json(rows);
    } catch (err) { sendError(res, 500, 'Failed to list coupons', err); }
  });

  return router;
};
