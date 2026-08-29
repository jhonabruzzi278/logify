'use strict';

const log = require('../../shared/logger');

const TENANT_TABLES = [
  'billing_customers', 'subscriptions', 'payments', 'provider_resources',
  'webhook_events', 'idempotency_keys', 'audit_events', 'outbox_events',
  'reconciliation_runs',
];

async function ensureSchema(pool, { enableFakeProvider = false } = {}) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id VARCHAR(100) PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      currency CHAR(3) NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
      interval VARCHAR(20) NOT NULL CHECK (interval IN ('month','year')),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS provider_plan_mappings (
      id UUID PRIMARY KEY,
      plan_id VARCHAR(100) NOT NULL REFERENCES billing_plans(id),
      provider VARCHAR(40) NOT NULL,
      provider_plan_id VARCHAR(200) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, provider)
    );

    CREATE TABLE IF NOT EXISTS billing_customers (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      email VARCHAR(254) NOT NULL,
      name VARCHAR(200),
      provider VARCHAR(40) NOT NULL,
      provider_customer_id VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, provider, email)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      billing_customer_id UUID NOT NULL REFERENCES billing_customers(id),
      plan_id VARCHAR(100) NOT NULL REFERENCES billing_plans(id),
      provider VARCHAR(40) NOT NULL,
      provider_subscription_id VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('incomplete','trialing','active','past_due','suspended','canceled')),
      checkout_url TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
      canceled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, provider_subscription_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      subscription_id UUID REFERENCES subscriptions(id),
      provider VARCHAR(40) NOT NULL,
      provider_payment_id VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending','authorized','succeeded','failed','refunded','disputed')),
      currency CHAR(3) NOT NULL,
      amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
      failure_code VARCHAR(100),
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, provider_payment_id)
    );

    CREATE TABLE IF NOT EXISTS provider_resources (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      provider VARCHAR(40) NOT NULL,
      resource_type VARCHAR(40) NOT NULL,
      local_resource_id UUID NOT NULL,
      provider_resource_id VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, resource_type, provider_resource_id)
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_event_id VARCHAR(200) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      signature_valid BOOLEAN NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed','dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error VARCHAR(500),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      UNIQUE (provider, provider_event_id)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      operation VARCHAR(100) NOT NULL,
      idempotency_key VARCHAR(128) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('processing','completed')),
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      UNIQUE (tenant_id, operation, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      actor_type VARCHAR(30) NOT NULL,
      actor_id VARCHAR(200),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id UUID NOT NULL,
      request_id VARCHAR(100),
      metadata JSONB NOT NULL DEFAULT '{}',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      topic VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(50) NOT NULL,
      aggregate_id UUID NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','published','failed','dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reconciliation_runs (
      id UUID PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      provider VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('running','completed','failed')),
      checked_count INTEGER NOT NULL DEFAULT 0,
      mismatch_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      error_summary VARCHAR(500)
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON subscriptions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_created ON payments(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status, received_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_events_delivery ON outbox_events(status, available_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_occurred ON audit_events(tenant_id, occurred_at DESC);
  `);

  await ensureAppendOnlyAudit(pool);
  if (enableFakeProvider) await seedSandboxPlan(pool);
}

async function ensureAppendOnlyAudit(pool) {
  await pool.query(`
    CREATE OR REPLACE FUNCTION reject_audit_mutation()
    RETURNS trigger AS $fn$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only';
    END;
    $fn$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
    CREATE TRIGGER audit_events_append_only
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
  `);
}

async function seedSandboxPlan(pool) {
  await pool.query(`
    INSERT INTO billing_plans (id, code, name, currency, amount_minor, interval)
    VALUES ('plan_sandbox_monthly', 'sandbox-monthly', 'Logify Sandbox Mensual', 'CLP', 1000, 'month')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO provider_plan_mappings (id, plan_id, provider, provider_plan_id)
    VALUES ('00000000-0000-4000-8000-000000000001', 'plan_sandbox_monthly', 'fake', 'fake_monthly')
    ON CONFLICT (plan_id, provider) DO NOTHING;
  `);
}

async function ensureRuntimeRole(pool, { password, databaseName = 'billing_db' }) {
  if (!password) {
    log.warn('DB_RUNTIME_PASSWORD no configurada; billing-service no habilitara acceso runtime');
    return false;
  }
  const escapedPassword = password.replace(/'/g, "''");
  const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname='app_runtime'");
  if (exists.rows.length) await pool.query(`ALTER ROLE app_runtime WITH PASSWORD '${escapedPassword}'`);
  else await pool.query(`CREATE ROLE app_runtime WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await pool.query(`GRANT CONNECT ON DATABASE ${databaseName} TO app_runtime`);
  await pool.query('GRANT USAGE ON SCHEMA public TO app_runtime');
  await pool.query('GRANT SELECT ON billing_plans, provider_plan_mappings TO app_runtime');
  for (const table of TENANT_TABLES) {
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO app_runtime`);
  }
  await pool.query('REVOKE UPDATE, DELETE ON audit_events FROM app_runtime');
  await pool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime');
  return true;
}

async function ensureRls(pool) {
  for (const table of TENANT_TABLES) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
    await pool.query(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    `);
  }
}

module.exports = { TENANT_TABLES, ensureSchema, ensureAppendOnlyAudit, seedSandboxPlan, ensureRuntimeRole, ensureRls };
