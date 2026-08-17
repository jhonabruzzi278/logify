// Resolución y validación de tenant/slug.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).

const DEFAULT_TENANT_SLUG = 'logify';

// Fase 4E del roadmap multi-tenant: mismos slugs reservados que ya usa el
// Frontend (ver Frontend/src/lib/api-config.ts RESERVED_TENANT_SLUGS) —
// duplicado aca porque backend y frontend no comparten paquete de constantes.
const RESERVED_TENANT_SLUGS = new Set(['www', 'api', 'app', 'admin', 'mail', 'logify', 'static', 'landing', 'demo', 'status']);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// Fase 4E: valida formato + reserva de un slug candidato para signup. No
// chequea disponibilidad contra la base (eso requiere una query aparte,
// usada tanto en /api/signup como en /api/signup/check-slug).
function validateSlugFormat(slug) {
  const value = (slug || '').trim().toLowerCase();
  if (!value) return 'El subdominio es obligatorio';
  if (!SLUG_PATTERN.test(value)) return 'El subdominio debe tener 3-63 caracteres: minusculas, numeros y guiones, sin empezar ni terminar en guion';
  if (RESERVED_TENANT_SLUGS.has(value)) return 'Ese subdominio esta reservado, elige otro';
  return null;
}

// Fase 4C del roadmap multi-tenant (ver wiki/Multi-Tenant.md): resuelve el
// tenant desde el slug del subdominio, con fallback al tenant por defecto
// cuando no viene header (desarrollo local, o cualquier cliente que no lo
// mande). Usado antes de tener JWT (login, forgot-password).
function createResolveTenant(pool) {
  return async function resolveTenant(slug) {
    const r = await pool.query('SELECT * FROM tenants WHERE slug=$1', [(slug || DEFAULT_TENANT_SLUG).toLowerCase()]);
    return r.rows[0] || null;
  };
}

module.exports = { DEFAULT_TENANT_SLUG, validateSlugFormat, createResolveTenant };
