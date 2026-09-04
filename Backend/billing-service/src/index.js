'use strict';

const path = require('node:path');
const { createApp } = require('../shared/app');
const { authMiddleware, requireTenant } = require('../shared/auth');
const { requirePlatformAdmin } = require('../shared/platform-auth');
const { attachTenantDb } = require('../shared/rls');
const log = require('../shared/logger');
const { BillingRepository } = require('./repositories/billing-repository');
const { BillingService } = require('./services/billing-service');
const { BillingProvider } = require('./providers/billing-provider');
const { FakeBillingProvider } = require('./providers/fake-provider');
const { ProviderRegistry } = require('./providers/provider-registry');
const { MetricsRegistry } = require('./observability/metrics');
const { requireMetricsToken } = require('./security/metrics-auth');
const { registerBillingRoutes } = require('./http/routes');
const { ensureSchema, ensureRuntimeRole, ensureRls } = require('./db/migrations');

const PORT = process.env.PORT || 8086;
const ENVIRONMENT = process.env.BILLING_ENVIRONMENT || 'sandbox';

function buildProviders(env = process.env) {
  const environment = env.BILLING_ENVIRONMENT || 'sandbox';
  const fakeEnabled = env.BILLING_FAKE_PROVIDER_ENABLED === 'true';
  if (fakeEnabled && environment === 'production') {
    throw new Error('El proveedor fake no puede habilitarse en production');
  }
  const providers = [];
  if (fakeEnabled) providers.push(new FakeBillingProvider({ checkoutBaseUrl: env.BILLING_FAKE_CHECKOUT_URL }));
  return new ProviderRegistry({ providers, defaultProvider: env.BILLING_DEFAULT_PROVIDER || 'none' });
}

function buildRuntime() {
  const { app, pool, runtimePool, start } = createApp('billing_db', PORT);
  if (!runtimePool) throw new Error('DB_RUNTIME_URL es obligatoria en billing-service para garantizar RLS');
  const metrics = new MetricsRegistry();
  const providers = buildProviders();
  const service = new BillingService({
    repository: new BillingRepository(), providers, metrics, environment: ENVIRONMENT,
  });
  registerBillingRoutes(app, {
    service,
    providers,
    metrics,
    metricsAuth: requireMetricsToken(process.env.BILLING_METRICS_TOKEN),
    platformAuth: requirePlatformAdmin,
    tenantAuth: [authMiddleware, requireTenant, attachTenantDb(runtimePool)],
  });
  return { app, pool, runtimePool, providers, start };
}

async function bootstrap(runtime = buildRuntime()) {
  const fakeEnabled = process.env.BILLING_FAKE_PROVIDER_ENABLED === 'true' && ENVIRONMENT !== 'production';
  await ensureSchema(runtime.pool, { enableFakeProvider: fakeEnabled });
  const roleReady = await ensureRuntimeRole(runtime.pool, {
    password: process.env.DB_RUNTIME_PASSWORD,
    databaseName: 'billing_db',
  });
  if (!roleReady) throw new Error('No se puede iniciar billing-service sin el rol runtime restringido');
  await ensureRls(runtime.pool);
  await runtime.start();
  log.info('billing-service bootstrap completed', { environment: ENVIRONMENT });
  return runtime;
}

function isMainModule(argv = process.argv) {
  return Boolean(argv[1]) && path.resolve(argv[1]) === __filename;
}

if (isMainModule()) {
  bootstrap().catch((err) => {
    log.error('billing-service startup failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { buildProviders, buildRuntime, bootstrap, isMainModule, BillingProvider };
