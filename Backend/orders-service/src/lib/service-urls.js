// URLs internas de los otros microservicios (red privada Docker logify-net).
// Centraliza literales que antes estaban duplicados dentro de src/index.js
// (una copia usada por la Saga de confirmación, otra por la purga de tenant
// en /api/admin) — mismos valores por defecto, sin cambio de comportamiento.
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8082';
const SHIPPING_URL = process.env.SHIPPING_SERVICE_URL || 'http://shipping-service:8084';
// Trafico interno entre contenedores dentro de la red privada de Docker
// (logify-net), nunca sale a internet -- mismo patron que INVENTORY_URL/
// SHIPPING_URL arriba, que ya usan http:// sin TLS por el mismo motivo.
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8085'; // NOSONAR

module.exports = { INVENTORY_URL, SHIPPING_URL, NOTIFICATION_URL };
