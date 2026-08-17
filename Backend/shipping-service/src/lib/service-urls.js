// URLs internas de los otros microservicios (red privada Docker logify-net).
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de valores).
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8085';
const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://orders-service:8081';

module.exports = { NOTIFICATION_URL, ORDERS_URL };
