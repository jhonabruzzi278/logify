// Fase 4B del roadmap multi-tenant (ver wiki/Multi-Tenant.md): resuelve el
// tenant desde el header X-Tenant-Slug, que el frontend deriva del
// subdominio (acme.logify.cl -> "acme"). Puramente informativo por ahora:
// nada filtra datos por esto todavia, eso llega en la Fase 4C via
// requireTenant + req.user.tenant_id (ya verificado desde el JWT).
function extractTenantSlug(req, _res, next) {
  const raw = req.headers['x-tenant-slug'];
  req.tenantSlug = raw ? String(raw).trim().toLowerCase() : null;
  next();
}

module.exports = { extractTenantSlug };
