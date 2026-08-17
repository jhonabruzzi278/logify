const log = require('../../shared/logger');
const { NOTIFICATION_URL } = require('./service-urls');

// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
async function sendNotification(req, shipment, stage, message) {
  try {
    await req.forwardedFetch(`${NOTIFICATION_URL}/api/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: require('uuid').v4(), orderId: shipment.order_id, customerId: shipment.customer_id, stage, status: shipment.status, message, sourceService: 'shipping-service', audience: 'BOTH', occurredAt: new Date().toISOString() }) });
  } catch (e) { log.error('Notification failed', { orderId: shipment.order_id, message: e.message }); }
}

module.exports = { sendNotification };
