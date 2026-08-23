// DDL de inventory-service: creación/evolución idempotente del esquema.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
module.exports = function createSchemaManager(pool) {
  async function ensureTables() {
    await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, stock INTEGER DEFAULT 0,
      name VARCHAR(200), price INTEGER DEFAULT 0, cost INTEGER DEFAULT 0,
      category VARCHAR(30) DEFAULT 'otros')`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku ON inventory (sku)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sales (id SERIAL PRIMARY KEY, sku VARCHAR(100) NOT NULL, quantity INTEGER NOT NULL, sale_date TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (event_type VARCHAR(64) NOT NULL, event_key VARCHAR(128) NOT NULL, processed_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (event_type, event_key))`);
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS name VARCHAR(200)`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'otros'`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_group VARCHAR(50)`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(200)`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS unit_price INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0`).catch(() => {});
    // Fase 2 del roadmap de expansión comercial: vincular ventas POS a un
    // cliente (para fiado/cuenta corriente, cuyo dueño es orders-service).
    // Sin FK física — mismo patrón de snapshot cross-servicio que vendor_name.
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200)`).catch(() => {});
    // Fase 3 del roadmap de expansión comercial: snapshot del costo unitario al
    // momento de la venta, para poder calcular ganancia real en Reportes (antes
    // solo se podía cruzar contra el costo actual de inventory, que cambia con
    // el tiempo). Ventas anteriores a este cambio quedan con cost=NULL.
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS cost NUMERIC`).catch(() => {});

    // Fase 3: Compras a proveedor. Sube stock y, opcionalmente, actualiza el
    // costo del producto; queda un historial completo (a diferencia del ajuste
    // manual de stock, que hoy no guarda motivo ni referencia).
    await pool.query(`CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, sku VARCHAR(100) NOT NULL,
      supplier_id INTEGER, unit_cost NUMERIC NOT NULL, quantity INTEGER NOT NULL,
      subtotal NUMERIC NOT NULL, update_prices BOOLEAN NOT NULL DEFAULT false,
      purchased_at TIMESTAMP NOT NULL DEFAULT NOW(), created_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases (tenant_id)`);

    // Fase 3: sesiones de caja (apertura/cierre por vendedor). No es un candado
    // que bloquee el POS — si no hay sesión abierta, se sigue pudiendo vender
    // (ver cierre-de-caja actual, que ya funciona sin sesión).
    await pool.query(`CREATE TABLE IF NOT EXISTS cash_sessions (
      id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, vendor_id VARCHAR(100) NOT NULL,
      vendor_name VARCHAR(200), opening_amount NUMERIC NOT NULL, opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMP, counted_amount NUMERIC, expected_amount NUMERIC, difference NUMERIC,
      status VARCHAR(10) NOT NULL DEFAULT 'open', created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cash_sessions_tenant ON cash_sessions (tenant_id)`);

    // Fase 1 del roadmap de expansión comercial (ver aidlc-docs/): proveedores
    // y productos ampliados. Las "variantes" (talla/color/presentación) se
    // modelan como otra fila de inventory con parent_sku apuntando al SKU base,
    // en vez de una tabla product_variants separada — mismo modelo flat que ya
    // usa el proyecto, evita mantener dos entidades de catálogo en paralelo.
    await pool.query(`CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, rut VARCHAR(20), phone VARCHAR(30),
      email VARCHAR(200), address VARCHAR(300), active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplier_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'unidad'`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price_includes_tax BOOLEAN DEFAULT true`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS parent_sku VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_label VARCHAR(100)`).catch(() => {});

    await ensureTenantColumns();
  }

  // Fase 4A del roadmap multi-tenant (ver wiki/Multi-Tenant.md): backfill al
  // tenant id=1 "logify", el mismo id fijo usado en las migraciones de los
  // otros 3 servicios (no hay FK cross-database entre las 4 bases).
  async function ensureTenantColumns() {
    for (const table of ['inventory', 'sales', 'processed_events', 'suppliers']) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
      await pool.query(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table} (tenant_id)`);
    }
  }

  // Fase 4C del roadmap multi-tenant: sku deja de ser unico globalmente y pasa
  // a ser unico por tenant (dos empresas pueden vender ambas el sku "COCA-2L").
  // processed_events (hoy sin uso real, ver wiki/Multi-Tenant.md) tambien
  // incorpora tenant_id a su PK compuesta por consistencia futura.
  async function ensureTenantConstraints() {
    await pool.query(`DROP INDEX IF EXISTS idx_inventory_sku`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uk_inventory_tenant_sku ON inventory (tenant_id, sku)`);
    await pool.query(`ALTER TABLE processed_events DROP CONSTRAINT IF EXISTS processed_events_pkey`).catch(() => {});
    await pool.query(`ALTER TABLE processed_events ADD PRIMARY KEY (tenant_id, event_type, event_key)`).catch(() => {});
  }

  return { ensureTables, ensureTenantColumns, ensureTenantConstraints };
};
