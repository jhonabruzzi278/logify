const jwt = require('jsonwebtoken');
const log = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'logify-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function signToken(user) {
  const payload = {
    sub: user.username,
    name: user.name || user.username,
    role: user.role,
    'cognito:groups': [user.role],
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
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

module.exports = {
  signToken,
  verifyToken,
  authMiddleware,
  requireRole,
  extractRoleFromRequest,
  JWT_SECRET,
};
