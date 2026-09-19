'use strict';

jest.mock('../../shared/logger', () => ({ warn: jest.fn() }));
const {
  TENANT_TABLES, ensureSchema, ensureAppendOnlyAudit, seedSandboxPlan, ensureRuntimeRole, ensureRls,
} = require('./migrations');

describe('billing migrations', () => {
  test('crea esquema y plan fake solo cuando se habilita', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await ensureSchema(pool, { enableFakeProvider: true });
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('CREATE TABLE IF NOT EXISTS subscriptions'))).toBe(true);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('plan_sandbox_monthly'))).toBe(true);
    await ensureAppendOnlyAudit(pool);
    await seedSandboxPlan(pool);
    const withoutFake = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await ensureSchema(withoutFake);
    expect(withoutFake.query.mock.calls.some(([sql]) => sql.includes('plan_sandbox_monthly'))).toBe(false);
  });

  test('crea o actualiza rol restringido y revoca mutacion de auditoria', async () => {
    const createPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await expect(ensureRuntimeRole(createPool, { password: "safe'password" })).resolves.toBe(true);
    expect(createPool.query.mock.calls.some(([sql]) => sql.includes('CREATE ROLE app_runtime'))).toBe(true);
    expect(createPool.query.mock.calls.some(([sql]) => sql.includes('REVOKE UPDATE, DELETE ON audit_events'))).toBe(true);

    const updatePool = { query: jest.fn().mockResolvedValue({ rows: [{ exists: 1 }] }) };
    await ensureRuntimeRole(updatePool, { password: 'safe' });
    expect(updatePool.query.mock.calls.some(([sql]) => sql.includes('ALTER ROLE app_runtime'))).toBe(true);
    await expect(ensureRuntimeRole(updatePool, { password: '' })).resolves.toBe(false);
  });

  test('habilita y fuerza RLS para toda tabla tenant', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await ensureRls(pool);
    expect(pool.query.mock.calls.filter(([sql]) => sql.includes('FORCE ROW LEVEL SECURITY'))).toHaveLength(TENANT_TABLES.length);
    expect(pool.query.mock.calls.filter(([sql]) => sql.includes('CREATE POLICY tenant_isolation'))).toHaveLength(TENANT_TABLES.length);
  });
});
