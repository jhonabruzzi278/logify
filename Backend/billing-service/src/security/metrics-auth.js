'use strict';

const crypto = require('crypto');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireMetricsToken(expectedToken) {
  return (req, res, next) => {
    if (!expectedToken) return res.status(503).json({ error: 'Metricas no configuradas' });
    const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(supplied, expectedToken)) return res.status(401).json({ error: 'No autorizado' });
    next();
  };
}

module.exports = { safeEqual, requireMetricsToken };
