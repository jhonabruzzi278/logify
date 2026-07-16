function applySecurity(app) {
  const helmet = require('helmet');
  const cors = require('cors');

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://smartlogix-five.vercel.app')
    .split(',').map(s => s.trim());
  // Túneles temporales (ngrok) para probar la demo fuera de la red local.
  const allowedOriginPatterns = [/^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/, /^https:\/\/[a-z0-9-]+\.ngrok\.io$/];

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
