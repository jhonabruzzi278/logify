function applySecurity(app) {
  const helmet = require('helmet');
  const cors = require('cors');

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://logify-five.vercel.app')
    .split(',').map(s => s.trim());

  if (allowedOrigins.includes('*')) {
    throw new Error(
      "ALLOWED_ORIGINS no soporta '*': listá los origenes exactos separados por coma " +
      '(ej. https://app.logify.cl,https://logify.cl). Los subdominios de logify.cl y ' +
      'los tuneles de ngrok ya se cubren automaticamente via patron, sin necesidad de wildcard.'
    );
  }

  // Túneles temporales (ngrok) para probar la demo fuera de la red local, y
  // cualquier subdominio de tenant (acme.logify.cl, etc. — ver
  // wiki/Multi-Tenant.md). ALLOWED_ORIGINS no soporta wildcard por texto
  // (es comparación exacta), por eso el dominio propio se cubre aquí como
  // patrón fijo en vez de depender de listar cada tenant.
  const allowedOriginPatterns = [
    /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
    /^https:\/\/[a-z0-9-]+\.ngrok\.io$/,
    /^https:\/\/([a-z0-9-]+\.)?logify\.cl$/,
  ];

  const isAllowedOrigin = (origin) => (
    !origin ||
    allowedOrigins.includes(origin) ||
    allowedOriginPatterns.some((pattern) => pattern.test(origin))
  );

  app.use(helmet({ frameguard: { action: 'deny' } }));

  // Un origen rechazado debe producir un 403 controlado. Pasar un Error al
  // callback de cors terminaba en el handler generico de Express como 500,
  // generando ruido operacional aunque el navegador igualmente bloqueara la
  // respuesta por ausencia de Access-Control-Allow-Origin.
  app.use((req, res, next) => {
    if (!isAllowedOrigin(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    next();
  });

  app.use(cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
  }));

  const rateLimit = require('express-rate-limit');
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { error: 'Too many requests, please try again later' },
  }));
}

module.exports = { applySecurity };
