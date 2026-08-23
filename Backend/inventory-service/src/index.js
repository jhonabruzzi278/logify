const { createApp } = require('../shared/app');

const { app, pool, sendError, start } = createApp('inventory_db', process.env.PORT || 8082);

const { ensureTables, ensureTenantColumns, ensureTenantConstraints } = require('./db/schema')(pool);
const { ensureProcedures } = require('./db/procedures')(pool);

app.use('/api/inventory', require('./routes/inventory.routes')({ pool, sendError }));
app.use('/api/sales', require('./routes/sales.routes')({ pool, sendError }));
app.use('/api/suppliers', require('./routes/suppliers.routes')({ pool, sendError }));
app.use('/api/purchases', require('./routes/purchases.routes')({ pool, sendError }));
app.use('/api/cash-sessions', require('./routes/cash-sessions.routes')({ pool, sendError }));
app.use('/api/admin', require('./routes/admin.routes')({ pool, sendError }));

if (require.main === module) {
  (async () => { await ensureTables(); await ensureTenantConstraints(); await ensureProcedures(); start(); })();
}

module.exports = { app, ensureTables, ensureTenantColumns, ensureTenantConstraints };
