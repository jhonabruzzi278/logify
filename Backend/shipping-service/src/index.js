const { createApp } = require('../shared/app');

const { app, pool, sendError, start } = createApp('shipping_db', process.env.PORT || 8084);

const { ensureTables, ensureTenantColumns, ensureTenantConstraints } = require('./db/schema')(pool);

app.use('/api/shipments', require('./routes/shipments.routes')({ pool, sendError }));
app.use('/api/admin', require('./routes/admin.routes')({ pool, sendError }));

if (require.main === module) {
  (async () => { await ensureTables(); await ensureTenantConstraints(); start(); })();
}

module.exports = { app, ensureTables, ensureTenantColumns, ensureTenantConstraints };
