const express = require('express');
const { createPool } = require('./db');
const log = require('./logger');
const { applySecurity } = require('./security');
const { gracefulShutdown } = require('./shutdown');
const { extractTenantSlug } = require('./tenant');

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
    return interServiceFetch(url, { ...options, headers });
  };
}

function createApp(dbName, port) {
  const app = express();
  applySecurity(app);
  app.use(express.json({ limit: '1mb' }));
  app.use(extractTenantSlug);

  const pool = createPool(dbName);

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
    gracefulShutdown(server, pool, null, dbName);
  }

  return { app, pool, sendError, interServiceFetch, start };
}

module.exports = { createApp, sendError, interServiceFetch };
