'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { registerBillingRoutes } = require('./routes');
const { fixture } = require('../testing/fixture');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });
  const { service, metrics } = fixture();
  const providers = service.providers;
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer valid') return res.status(401).json({ error: 'unauthorized' });
    req.user = { sub: 'user_1' }; req.tenantId = 7; req.db = {}; next();
  };
  registerBillingRoutes(app, {
    service, metrics, providers,
    tenantAuth: [authenticate],
    platformAuth: authenticate,
    metricsAuth: (req, res, next) => req.headers.authorization === 'Bearer metrics' ? next() : res.sendStatus(401),
  });
  return app;
}

function createFailingAdminApp() {
  const app = express();
  app.use(express.json());
  const { service, metrics, providers } = fixture();
  providers.get = () => ({ healthCheck: async () => { throw new Error('down'); } });
  registerBillingRoutes(app, {
    service, metrics, providers, tenantAuth: [],
    platformAuth: (_req, _res, next) => next(),
    metricsAuth: (_req, _res, next) => next(),
  });
  return app;
}

describe('billing HTTP API', () => {
  test('protege rutas tenant y exige idempotencia', async () => {
    const app = createTestApp();
    await request(app).post('/api/billing/v1/subscriptions').expect(401);
    const response = await request(app)
      .post('/api/billing/v1/subscriptions')
      .set('Authorization', 'Bearer valid')
      .send({ planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } })
      .expect(400);
    expect(response.body.code).toBe('invalid_idempotency_key');
    expect(response.body.requestId).toBeTruthy();
  });

  test('crea, lee y cancela una suscripcion', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/api/billing/v1/subscriptions')
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'http-create-1')
      .send({ planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } })
      .expect(201);
    const replay = await request(app)
      .post('/api/billing/v1/subscriptions')
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'http-create-1')
      .send({ planId: 'plan_sandbox_monthly', customer: { email: 'a@example.cl' } })
      .expect(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    await request(app)
      .get(`/api/billing/v1/subscriptions/${created.body.id}`)
      .set('Authorization', 'Bearer valid')
      .expect(200);
    const canceled = await request(app)
      .post(`/api/billing/v1/subscriptions/${created.body.id}/cancel`)
      .set('Authorization', 'Bearer valid')
      .set('Idempotency-Key', 'http-cancel-1')
      .expect(200);
    expect(canceled.body).toMatchObject({ status: 'canceled' });
  });

  test('protege metricas y expone salud de proveedores solo a admin', async () => {
    const app = createTestApp();
    await request(app).get('/metrics').expect(401);
    await request(app).get('/metrics').set('Authorization', 'Bearer metrics').expect(200);
    const providers = await request(app)
      .get('/api/billing/v1/admin/providers')
      .set('Authorization', 'Bearer valid')
      .expect(200);
    expect(providers.body.providers[0]).toMatchObject({ id: 'fake', healthy: true });
    const unhealthy = await request(createFailingAdminApp()).get('/api/billing/v1/admin/providers').expect(200);
    expect(unhealthy.body.providers[0]).toMatchObject({ healthy: false });
  });

  test('oculta errores internos y permite omitir la superficie admin', async () => {
    const app = express();
    app.use(express.json());
    const metrics = { render: () => '' };
    registerBillingRoutes(app, {
      service: { createSubscription: async () => { throw new Error('database secret'); } },
      metrics,
      providers: { describe: () => [] },
      tenantAuth: [(req, _res, next) => { req.tenantId = 7; req.db = {}; next(); }],
      metricsAuth: (_req, _res, next) => next(),
    });
    const response = await request(app)
      .post('/api/billing/v1/subscriptions')
      .set('Idempotency-Key', 'unexpected-error-1')
      .send({})
      .expect(500);
    expect(response.body.error).toBe('Internal server error');
    expect(JSON.stringify(response.body)).not.toContain('database secret');
    await request(app).get('/api/billing/v1/admin/providers').expect(404);
  });
});
