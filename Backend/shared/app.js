const crypto = require('crypto');
const express = require('express');
const { createPool } = require('./db');
const log = require('./logger');
const { applySecurity } = require('./security');
const { gracefulShutdown } = require('./shutdown');
const { extractTenantSlug } = require('./tenant');

// Correlaciona logs de un mismo request a traves de los 4 microservicios:
// hereda x-request-id si ya viene de otro servicio (forwardedFetch lo agrega),
// o genera uno nuevo si es la entrada original del request.
function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  log.runWithRequestId(requestId, next);
}

function sendError(res, status, logMessage, err) {
  log.warn(logMessage, { error: err?.message || String(err) });
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err?.message || 'Request failed') });
}

async function interServiceFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
  return response;
}

function forwardedFetch(req) {
  return async function (url, options = {}) {
    const auth = req.headers['authorization'] || '';
    const headers = { ...(options.headers || {}) };
    if (auth && !headers['authorization']) {
      headers['authorization'] = auth;
    }
    const tenantSlug = req.user?.tenant_slug || req.tenantSlug;
    if (tenantSlug && !headers['x-tenant-slug']) {
      headers['x-tenant-slug'] = tenantSlug;
    }
    if (req.requestId && !headers['x-request-id']) {
      headers['x-request-id'] = req.requestId;
    }
    return interServiceFetch(url, { ...options, headers });
  };
}

function accessLogMiddleware(req, res, next) {
  if (req.path === '/health') return next();
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level]('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });
  next();
}

function createApp(dbName, port) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(accessLogMiddleware);
  applySecurity(app);
  app.use(express.json({ limit: '1mb' }));
  app.use(extractTenantSlug);

  // "pool" conecta como superusuario (DB_URL) y se usa solo para DDL/migraciones
  // al arrancar (ensureTables, etc). "runtimePool" conecta con un rol restringido
  // sin BYPASSRLS (DB_RUNTIME_URL) y es el que deben usar los request handlers
  // via attachTenantDb (ver shared/rls.js) -- un superusuario ignora las
  // politicas RLS sin importar FORCE ROW LEVEL SECURITY, asi que las queries
  // de request nunca deben correr sobre "pool" en un servicio con RLS activo.
  const pool = createPool(dbName);
  const runtimePool = process.env.DB_RUNTIME_URL ? createPool(dbName, process.env.DB_RUNTIME_URL) : null;

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'UP', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'DEGRADED', db: 'disconnected' });
    }
  });

  app.use((req, _res, next) => {
    req.forwardedFetch = forwardedFetch(req);
    next();
  });

  async function start() {
    const server = app.listen(port, () => log.info(`${dbName} running on port ${port}`));
    gracefulShutdown(server, [pool, runtimePool], null, dbName);
  }

  return { app, pool, runtimePool, sendError, interServiceFetch, start };
}

module.exports = { createApp, sendError, interServiceFetch };
