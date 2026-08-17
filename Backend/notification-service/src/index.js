const { createApp } = require('../shared/app');

const { app, pool, sendError, start } = createApp('notification_db', process.env.PORT || 8085);

const { ensureTables, ensureTenantColumns, ensureTenantConstraints } = require('./db/schema')(pool);

app.use('/api/notifications', require('./routes/notifications.routes')({ pool, sendError }));
app.use('/api/admin', require('./routes/admin.routes')({ pool, sendError }));

if (require.main === module) {
  (async () => { await ensureTables(); await ensureTenantConstraints(); start(); })();
}

module.exports = { app, ensureTables, ensureTenantColumns, ensureTenantConstraints };
