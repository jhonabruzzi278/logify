'use strict';

const express = require('express');
const { BillingError, validateIdempotencyKey } = require('../domain/billing');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requestContext(req) {
  return {
    tenantId: Number(req.tenantId),
    actorType: 'user',
    actorId: req.user?.sub || req.user?.username || null,
    requestId: req.requestId || null,
  };
}

function registerBillingRoutes(app, {
  service,
  tenantAuth = [],
  platformAuth,
  metrics,
  metricsAuth,
  providers,
}) {
  const router = express.Router();

  router.post('/subscriptions', ...tenantAuth, asyncRoute(async (req, res) => {
    const result = await service.createSubscription({
      db: req.db,
      context: requestContext(req),
      idempotencyKey: validateIdempotencyKey(req.headers['idempotency-key']),
      input: req.body || {},
    });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    res.status(result.status).json(result.body);
  }));

  router.get('/subscriptions/:subscriptionId', ...tenantAuth, asyncRoute(async (req, res) => {
    const subscription = await service.getSubscription({
      db: req.db,
      context: requestContext(req),
      subscriptionId: req.params.subscriptionId,
    });
    res.json(subscription);
  }));

  router.post('/subscriptions/:subscriptionId/cancel', ...tenantAuth, asyncRoute(async (req, res) => {
    const result = await service.cancelSubscription({
      db: req.db,
      context: requestContext(req),
      subscriptionId: req.params.subscriptionId,
      idempotencyKey: validateIdempotencyKey(req.headers['idempotency-key']),
    });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    res.status(result.status).json(result.body);
  }));

  if (platformAuth) {
    router.get('/admin/providers', platformAuth, asyncRoute(async (_req, res) => {
      const checks = await Promise.all(providers.describe().map(async (item) => {
        try {
          const health = await providers.get(item.id).healthCheck();
          return { ...item, configured: true, healthy: Boolean(health.ok) };
        } catch {
          return { ...item, configured: true, healthy: false };
        }
      }));
      res.json({ providers: checks });
    }));
  }

  app.use('/api/billing/v1', router);

  app.get('/metrics', metricsAuth, (_req, res) => {
    res.type('text/plain; version=0.0.4').send(metrics.render());
  });

  app.use((err, req, res, _next) => {
    if (err instanceof BillingError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        requestId: req.requestId,
      });
    }
    const log = require('../../shared/logger');
    log.error('Unhandled billing request error', { error: err?.message || String(err) });
    return res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
  });

  return app;
}

module.exports = { registerBillingRoutes, asyncRoute, requestContext };
