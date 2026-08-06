const jwt = require('jsonwebtoken');
const log = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'logify-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Rotacion de secreto sin downtime (ver wiki/Rotacion-JWT.md): JWT_SECRET_PREVIOUS
// es opcional y solo se usa para VERIFICAR tokens ya emitidos con el secreto
// anterior, nunca para firmar. Procedimiento: setear JWT_SECRET_PREVIOUS=<secreto
// viejo> y JWT_SECRET=<secreto nuevo> en los 4 servicios, hacer rolling restart;
// los tokens viejos (hasta JWT_EXPIRES_IN de antiguedad) siguen siendo validos
// durante la ventana de rotacion. Pasado ese tiempo, quitar JWT_SECRET_PREVIOUS.
const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS || null;

function signToken(user) {
  const payload = {
    sub: user.username,
    name: user.name || user.username,
    role: user.role,
    tenant_id: user.tenant_id,
    tenant_slug: user.tenant_slug,
    'cognito:groups': [user.role],
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (JWT_SECRET_PREVIOUS && err.name === 'JsonWebTokenError') {
      return jwt.verify(token, JWT_SECRET_PREVIOUS);
    }
    throw err;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticacion requerida' });
    }
    const userRole = (req.user.role || '').toLowerCase();
    const allowed = roles.map(r => r.toLowerCase());
    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    }
    next();
  };
}

function extractRoleFromRequest(req) {
  if (!req.user) return null;
  return (req.user.role || '').toLowerCase();
}

// Fase 4C del roadmap multi-tenant (ver wiki/Multi-Tenant.md): exige que el
// JWT traiga un tenant valido y bloquea el reuso de un token de un tenant
// contra el subdominio de otro. Se monta despues de authMiddleware y antes
// de requireRole en cada ruta protegida. req.tenantId (del JWT, ya
// verificado) es lo unico que debe usarse para filtrar datos - nunca
// req.tenantSlug (viene del header, sin verificar).
function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticacion requerida' });
  }
  if (!req.user.tenant_id) {
    return res.status(401).json({ error: 'Sesion invalida, inicia sesion de nuevo' });
  }
  if (req.tenantSlug && req.user.tenant_slug && req.tenantSlug !== req.user.tenant_slug) {
    return res.status(403).json({ error: 'Este token no pertenece a este dominio' });
  }
  req.tenantId = req.user.tenant_id;
  next();
}

module.exports = {
  signToken,
  verifyToken,
  authMiddleware,
  requireRole,
  requireTenant,
  extractRoleFromRequest,
  JWT_SECRET,
};
