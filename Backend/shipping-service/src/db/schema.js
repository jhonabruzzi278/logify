// DDL de shipping-service: creación/evolución idempotente del esquema.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
module.exports = function createSchemaManager(pool) {
  async function ensureTables() {
    await pool.query(`CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, customer_id INTEGER DEFAULT 0,
      sku VARCHAR(100) NOT NULL, quantity INTEGER NOT NULL, status VARCHAR(30) DEFAULT 'EN_PREPARACION',
      tracking_number VARCHAR(20), created_at TIMESTAMP DEFAULT NOW(), shipped_at TIMESTAMP,
      customer_code VARCHAR(20), recipient_rut VARCHAR(15), proof_of_delivery_image TEXT)`);
    await pool.query(`ALTER TABLE shipments ALTER COLUMN customer_id DROP NOT NULL`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (event_type VARCHAR(64) NOT NULL, event_key VARCHAR(128) NOT NULL, processed_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (event_type, event_key))`);
    await ensureTenantColumns();
  }

  // Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): backfill al
  // tenant id=1 "logify", el mismo id fijo usado en las migraciones de los
  // otros 3 servicios (no hay FK cross-database entre las 4 bases).
  async function ensureTenantColumns() {
    for (const table of ['shipments', 'processed_events']) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
      await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
    }
  }

  // Fase 4C del roadmap multi-tenant: processed_events (hoy sin uso real, ver
  // wiki/Multi-Tenant.md) incorpora tenant_id a su PK compuesta por
  // consistencia con inventory_db.
  async function ensureTenantConstraints() {
    await pool.query(`ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_pkey`).catch(() => {});
    await pool.query(`ALTER TABLE processed_events ADD PRIMARY KEY (tenant_id, event_type, event_key)`).catch(() => {});
  }

  return { ensureTables, ensureTenantColumns, ensureTenantConstraints };
};
