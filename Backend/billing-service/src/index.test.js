'use strict';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BILLING_ENVIRONMENT = 'sandbox';

jest.mock('../shared/app', () => ({ createApp: jest.fn() }));
jest.mock('../shared/auth', () => ({ authMiddleware: jest.fn(), requireTenant: jest.fn() }));
jest.mock('../shared/platform-auth', () => ({ requirePlatformAdmin: jest.fn() }));
jest.mock('../shared/rls', () => ({ attachTenantDb: jest.fn(() => jest.fn()) }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), error: jest.fn() }));
jest.mock('./http/routes', () => ({ registerBillingRoutes: jest.fn() }));
jest.mock('./db/migrations', () => ({
  ensureSchema: jest.fn(), ensureRuntimeRole: jest.fn(), ensureRls: jest.fn(),
}));

const { createApp } = require('../shared/app');
const { registerBillingRoutes } = require('./http/routes');
const migrations = require('./db/migrations');
const { buildProviders, buildRuntime, bootstrap, isMainModule } = require('./index');

describe('billing bootstrap wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BILLING_ENVIRONMENT = 'sandbox';
    process.env.BILLING_FAKE_PROVIDER_ENABLED = 'true';
    process.env.BILLING_DEFAULT_PROVIDER = 'fake';
    process.env.DB_RUNTIME_PASSWORD = 'runtime-test';
  });

  test('habilita fake solo fuera de production', () => {
    const registry = buildProviders({
      BILLING_ENVIRONMENT: 'sandbox', BILLING_FAKE_PROVIDER_ENABLED: 'true',
      BILLING_DEFAULT_PROVIDER: 'fake', BILLING_FAKE_CHECKOUT_URL: 'https://sandbox.test',
    });
    expect(registry.describe()).toEqual([{ id: 'fake', active: true }]);
    expect(() => buildProviders({
      BILLING_ENVIRONMENT: 'production', BILLING_FAKE_PROVIDER_ENABLED: 'true',
    })).toThrow('no puede habilitarse');
    expect(buildProviders({ BILLING_ENVIRONMENT: 'sandbox' }).describe()).toEqual([]);
  });

  test('detecta de forma portable si el archivo es el entrypoint', () => {
    expect(isMainModule(['node', require.resolve('./index')])).toBe(true);
    expect(isMainModule(['node', require.resolve('./index.test')])).toBe(false);
    expect(isMainModule(['node'])).toBe(false);
  });

  test('construye runtime con RLS obligatorio y registra rutas', () => {
    const runtime = { app: {}, pool: {}, runtimePool: {}, start: jest.fn() };
    createApp.mockReturnValue(runtime);
    expect(buildRuntime()).toMatchObject(runtime);
    expect(registerBillingRoutes).toHaveBeenCalledTimes(1);
    createApp.mockReturnValue({ ...runtime, runtimePool: null });
    expect(() => buildRuntime()).toThrow('DB_RUNTIME_URL');
  });

  test('migra, habilita RLS e inicia; falla cerrado sin rol runtime', async () => {
    const runtime = { pool: {}, start: jest.fn().mockResolvedValue() };
    migrations.ensureRuntimeRole.mockResolvedValueOnce(true);
    await expect(bootstrap(runtime)).resolves.toBe(runtime);
    expect(migrations.ensureSchema).toHaveBeenCalledWith(runtime.pool, { enableFakeProvider: true });
    expect(migrations.ensureRls).toHaveBeenCalledWith(runtime.pool);
    expect(runtime.start).toHaveBeenCalled();

    migrations.ensureRuntimeRole.mockResolvedValueOnce(false);
    await expect(bootstrap(runtime)).rejects.toThrow('rol runtime');
  });
});
