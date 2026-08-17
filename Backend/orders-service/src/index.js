const { createApp } = require('../shared/app');
const { attachTenantDb } = require('../shared/rls');
const { registerSecurityModule } = require('./security-module');
const { createResolveTenant } = require('./lib/tenant');

const { app, pool, runtimePool, sendError, start } = createApp('orders_db', process.env.PORT || 8081);
const withTenantDb = attachTenantDb(runtimePool);
const resolveTenant = createResolveTenant(pool);

const { ensureTables, ensureTenants, ensureTenantConstraints, seedUsers, ensureSecurityProfiles } = require('./db/schema')(pool);
const { ensureProcedures } = require('./db/procedures')(pool);
const { ensureRuntimeRole, ensureRls } = require('./db/rls-setup')(pool);

// ═══ AUTH ENDPOINTS ═══════════════════════════════════════════════════════════════

registerSecurityModule(app, pool, sendError, resolveTenant);

app.use('/api/signup', require('./routes/signup.routes')({ pool, sendError }));
app.use('/api/auth', require('./routes/auth.routes')({ pool, sendError, withTenantDb, resolveTenant }));
app.use('/api/orders', require('./routes/orders.routes')({ pool, sendError, withTenantDb, resolveTenant }));
app.use('/api/customers', require('./routes/customers.routes')({ sendError, withTenantDb }));
app.use('/api/settings', require('./routes/settings.routes')({ sendError, withTenantDb }));
app.use('/api/admin', require('./routes/admin.routes')({ pool, sendError, resolveTenant }));

if (require.main === module) {
  (async () => {
    await ensureTables();
    await ensureTenantConstraints();
    await seedUsers();
    await ensureSecurityProfiles();
    await ensureProcedures();
    await ensureRuntimeRole();
    await ensureRls();
    start();
  })();
}

module.exports = { app, ensureTables, ensureTenants, ensureTenantConstraints, seedUsers, ensureSecurityProfiles, ensureRuntimeRole, ensureRls };
