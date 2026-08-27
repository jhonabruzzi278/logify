'use strict';

const { verifyToken } = require('@clerk/backend');

function getAllowedAdminIds() {
  return new Set(
    (process.env.PLATFORM_ADMIN_CLERK_USER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

async function requirePlatformAdmin(req, res, next) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const allowedAdminIds = getAllowedAdminIds();

  if (!secretKey || allowedAdminIds.size === 0) {
    return res.status(503).json({ error: 'El acceso de administración de plataforma no está configurado' });
  }

  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Sesión administrativa requerida' });
  }

  try {
    const payload = await verifyToken(match[1], { secretKey });
    if (!payload.sub || !allowedAdminIds.has(payload.sub)) {
      return res.status(403).json({ error: 'No tienes permisos de administración de plataforma' });
    }

    req.platformAdmin = {
      clerkUserId: payload.sub,
      sessionId: payload.sid,
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Sesión administrativa inválida o expirada' });
  }
}

module.exports = { getAllowedAdminIds, requirePlatformAdmin };
