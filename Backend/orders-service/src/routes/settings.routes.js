const express = require('express');
const { authMiddleware, requireTenant, requireRole } = require('../../shared/auth');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
// Montado en index.js como app.use('/api/settings', settingsRoutes({ sendError, withTenantDb })).
module.exports = function settingsRoutes({ sendError, withTenantDb }) {
  const router = express.Router();

  function toBusinessSettingsDto(tenant) {
    return {
      name: tenant.name,
      contactEmail: tenant.contact_email,
      businessRut: tenant.business_rut,
      businessCountry: tenant.business_country,
      businessIndustry: tenant.business_industry,
      businessPhone: tenant.business_phone,
    };
  }

  router.get('/business', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const r = await req.db.query('SELECT * FROM tenants WHERE id=$1', [req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
      res.json(toBusinessSettingsDto(r.rows[0]));
    } catch (err) { sendError(res, 500, 'Failed to get business settings', err); }
  });

  router.put('/business', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const { name, contactEmail, businessRut, businessCountry, businessIndustry, businessPhone } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
      const r = await req.db.query(
        `UPDATE tenants SET name=$1, contact_email=$2, business_rut=$3, business_country=$4,
          business_industry=$5, business_phone=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
        [name.trim(), contactEmail || null, businessRut || null, businessCountry || null,
         businessIndustry || null, businessPhone || null, req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
      res.json(toBusinessSettingsDto(r.rows[0]));
    } catch (err) { sendError(res, 500, 'Failed to update business settings', err); }
  });

  router.get('/system', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const r = await req.db.query('SELECT settings FROM tenants WHERE id=$1', [req.tenantId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
      res.json(r.rows[0].settings || {});
    } catch (err) { sendError(res, 500, 'Failed to get system settings', err); }
  });

  router.put('/system', authMiddleware, requireTenant, withTenantDb, requireRole('owner', 'admin'), async (req, res) => {
    try {
      const current = await req.db.query('SELECT settings FROM tenants WHERE id=$1', [req.tenantId]);
      if (!current.rows.length) return res.status(404).json({ error: 'Negocio no encontrado' });
      const merged = { ...(current.rows[0].settings || {}), ...req.body };
      const r = await req.db.query('UPDATE tenants SET settings=$1, updated_at=NOW() WHERE id=$2 RETURNING settings', [JSON.stringify(merged), req.tenantId]);
      res.json(r.rows[0].settings || {});
    } catch (err) { sendError(res, 500, 'Failed to update system settings', err); }
  });

  return router;
};
