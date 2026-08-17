const log = require('../../shared/logger');

// Row Level Security (ver wiki/Seguridad-y-RLS.md y el hallazgo de la
// auditoria de produccion): las politicas de abajo son la red de seguridad
// a nivel de base de datos para el aislamiento multi-tenant, complementando
// (no reemplazando) los WHERE tenant_id=$N que ya tiene cada query. Un
// superusuario de Postgres SIEMPRE bypassea RLS sin importar FORCE ROW LEVEL
// SECURITY, asi que esto solo protege de verdad si las queries de request
// corren con el rol restringido "app_runtime" (ver shared/rls.js) -- por eso
// existe runtimePool/DB_RUNTIME_URL separado de la conexion de superusuario
// que usa ensureTables/seedUsers al arrancar.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de SQL).
const RLS_TABLES = [
  { name: 'orders', tenantColumn: 'tenant_id' },
  { name: 'customers', tenantColumn: 'tenant_id' },
  { name: 'customer_credit_movements', tenantColumn: 'tenant_id' },
  { name: 'user_invitations', tenantColumn: 'tenant_id' },
  { name: 'users', tenantColumn: 'tenant_id' },
  { name: 'tenants', tenantColumn: 'id' },
];

module.exports = function createRlsManager(pool) {
  async function ensureRuntimeRole() {
    const password = process.env.DB_RUNTIME_PASSWORD;
    if (!password) {
      log.warn('DB_RUNTIME_PASSWORD no esta configurada; se omite la creacion del rol restringido de runtime (RLS no estara activo)');
      return;
    }
    const escapedPassword = password.replace(/'/g, "''");
    const exists = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname='app_runtime'`);
    if (exists.rows.length) {
      await pool.query(`ALTER ROLE app_runtime WITH PASSWORD '${escapedPassword}'`);
    } else {
      await pool.query(`CREATE ROLE app_runtime WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    }
    await pool.query(`GRANT CONNECT ON DATABASE orders_db TO app_runtime`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO app_runtime`);
    for (const { name } of RLS_TABLES) {
      await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${name} TO app_runtime`);
    }
    await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime`);
    await pool.query(`GRANT EXECUTE ON FUNCTION fn_get_orders_with_customer(TEXT, INT) TO app_runtime`).catch(() => {});
    await pool.query(`GRANT EXECUTE ON FUNCTION fn_cancel_order(INT, TEXT, INT) TO app_runtime`).catch(() => {});
    await pool.query(`GRANT EXECUTE ON FUNCTION fn_adjust_customer_credit(INT, NUMERIC, INT) TO app_runtime`).catch(() => {});
  }

  async function ensureRls() {
    for (const { name, tenantColumn } of RLS_TABLES) {
      await pool.query(`ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY`);
      await pool.query(`ALTER TABLE ${name} FORCE ROW LEVEL SECURITY`);
      await pool.query(`DROP POLICY IF EXISTS tenant_isolation ON ${name}`);
      await pool.query(`
        CREATE POLICY tenant_isolation ON ${name}
        USING (${tenantColumn} = current_setting('app.tenant_id', true)::int)
        WITH CHECK (${tenantColumn} = current_setting('app.tenant_id', true)::int)
      `);
    }
  }

  return { ensureRuntimeRole, ensureRls };
};
