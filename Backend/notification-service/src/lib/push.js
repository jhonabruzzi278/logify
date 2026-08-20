const webpush = require('web-push');
const log = require('../../shared/logger');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:logistica@logify.cl', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Fase 4C del roadmap multi-tenant: antes esto mandaba push a TODAS las
// suscripciones sin filtrar (fuga de datos entre tenants) - ahora exige
// tenantId y solo notifica a las suscripciones de ese tenant.
function createBroadcastPush(pool) {
  return async function broadcastPush(payload, tenantId) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !tenantId) return;
    const subs = (await pool.query('SELECT * FROM push_subscriptions WHERE tenant_id=$1', [tenantId])).rows;
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]).catch(() => {});
        } else {
          log.warn('Push send failed', { message: err.message });
        }
      }
    }));
  };
}

module.exports = { VAPID_PUBLIC_KEY, createBroadcastPush };
