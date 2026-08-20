// DDL de notification-service: creación/evolución idempotente del esquema.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
module.exports = function createSchemaManager(pool) {
  async function ensureTables() {
    await pool.query(`CREATE TABLE IF NOT EXISTS notification_records (
      id SERIAL PRIMARY KEY, event_id VARCHAR(64) NOT NULL, order_id INTEGER NOT NULL,
      customer_id INTEGER DEFAULT 0, stage VARCHAR(40) NOT NULL, status VARCHAR(30) DEFAULT 'NOTIFIED',
      message VARCHAR(500) NOT NULL, target_audience VARCHAR(20) NOT NULL,
      source_service VARCHAR(50) DEFAULT 'external', occurred_at TIMESTAMP DEFAULT NOW(), received_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_order ON notification_records (order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_audience ON notification_records (target_audience)`);
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uk_notif_event_audience') THEN ALTER TABLE notification_records ADD CONSTRAINT uk_notif_event_audience UNIQUE (event_id, target_audience); END IF; END $$`);
    await pool.query(`ALTER TABLE notification_records ALTER COLUMN customer_id DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE notification_records ALTER COLUMN status DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE notification_records ALTER COLUMN source_service DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE notification_records ALTER COLUMN occurred_at DROP NOT NULL`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      username VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`);
    await ensureTenantColumns();
  }

  // Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): backfill al
  // tenant id=1 "logify", el mismo id fijo usado en las migraciones de los
  // otros 3 servicios (no hay FK cross-database entre las 4 bases).
  async function ensureTenantColumns() {
    for (const table of ['notification_records', 'push_subscriptions']) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
      await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
    }
  }

  // Fase 4C: uk_notif_event_audience pasa a incluir tenant_id (dos empresas
  // pueden ambas emitir un evento con el mismo event_id).
  async function ensureTenantConstraints() {
    await pool.query(`ALTER TABLE notification_records DROP CONSTRAINT IF EXISTS uk_notif_event_audience`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_notif_tenant_event_audience ON notification_records (tenant_id, event_id, target_audience)`);
  }

  return { ensureTables, ensureTenantColumns, ensureTenantConstraints };
};
