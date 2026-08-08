const crypto = require('crypto');

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Proteccion compartida para endpoints administrativos de plataforma
// (no hay panel de super-admin todavia, ver wiki/Multi-Tenant.md Fase 4E
// pendiente). Todos los servicios que necesiten un endpoint /api/admin/*
// deben usar este mismo middleware, protegido por el secreto compartido
// PLATFORM_ADMIN_KEY (mismo valor en los 4 servicios via docker-compose.prod.yml).
function requireAdminKey(req, res, next) {
  const configured = process.env.PLATFORM_ADMIN_KEY;
  if (!configured) return res.status(503).json({ error: 'PLATFORM_ADMIN_KEY no configurado' });
  const provided = req.headers['x-admin-key'];
  if (!provided || !safeEqual(provided, configured)) {
    return res.status(401).json({ error: 'Clave de administración inválida' });
  }
  next();
}

module.exports = { requireAdminKey, safeEqual };
