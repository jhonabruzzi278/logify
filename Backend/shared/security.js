function applySecurity(app) {
  const helmet = require('helmet');
  const cors = require('cors');

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://logify-five.vercel.app')
    .split(',').map(s => s.trim());
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

  app.use(helmet());

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins[0] === '*' || allowedOrigins.includes(origin)) return cb(null, true);
      if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) return cb(null, true);
      cb(new Error('CORS not allowed'));
    },
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
