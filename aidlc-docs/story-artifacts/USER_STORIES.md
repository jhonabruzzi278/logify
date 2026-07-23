# User Stories

Reconstruidas retroactivamente a partir del flujo de negocio documentado en `wiki/Flujo-de-Negocio.md` y el comportamiento real del código (no existían historias de usuario formales en el repo — son inferidas, marcadas con la fuente).

## Épica: Ciclo de vida de un pedido

**US-1** — Como `ops`, quiero crear un cliente con su RUT y datos de contacto, para poder asociarlo a pedidos futuros.
*Fuente: `POST /api/customers`, `wiki/Flujo-de-Negocio.md` paso 1*

**US-2** — Como `ops`, quiero crear un pedido especificando cliente, SKU y cantidad, para iniciar el proceso de venta.
*Fuente: `POST /api/orders`, genera `SL-XXXXXX`*

**US-3** — Como `ops`, quiero confirmar un pedido con una sola acción y que el sistema descuente stock y genere el envío automáticamente, para no tener que coordinar manualmente entre inventario y despacho.
*Fuente: `PUT /api/orders/:id/confirm` (Saga)*

**US-4** — Como `ops`, quiero asignar un transportista a un pedido confirmado, para que quede claro quién lo entrega.
*Fuente: `PUT /api/orders/:id/assign?transporter=`*

**US-5** — Como `shipper`, quiero ver solo los envíos que tengo asignados y avanzar su estado a "en reparto", sin poder ver el código de verificación del cliente, para que la verificación de identidad en la entrega dependa de que yo la obtenga directamente del cliente.
*Fuente: `wiki/Codigo-de-Cliente.md`, `RESTRICTED_ROLES`*

**US-6** — Como `shipper`, quiero confirmar la entrega ingresando el código del cliente y su RUT, para que el sistema valide que estoy entregando a la persona correcta antes de cerrar el pedido.
*Fuente: `PUT /api/shipments/:id/stage?stage=ENTREGADO`, validación de dos factores*

**US-7** — Como `customer`, quiero consultar el estado de mi pedido usando solo mi código `SL-XXXXXX`, sin necesitar una cuenta ni iniciar sesión, para hacer seguimiento fácilmente.
*Fuente: `GET /api/orders/track/:clientCode` (endpoint público)*

**US-8** — Como `ops` u `owner`, quiero poder cancelar un pedido con un motivo, y que el stock se restaure automáticamente si aún no fue despachado, para no perder inventario por errores o cambios de opinión del cliente.
*Fuente: `PUT /api/orders/:id/cancel`, `fn_cancel_order`*

## Épica: Gestión de inventario

**US-9** — Como `warehouse`, quiero ajustar el stock de un producto de forma atómica (sin condiciones de carrera), para que el inventario nunca quede negativo ni inconsistente.
*Fuente: `fn_adjust_stock` con `SELECT ... FOR UPDATE`*

**US-10** — Como `warehouse` u `owner`, quiero ver un reporte clasificado de productos por nivel de stock (sin stock / crítico / bajo / normal), para priorizar reabastecimiento.
*Fuente: `fn_get_inventory_report`*

**US-11** — Como `vendor`, quiero registrar una venta directa en el punto de venta sin crear un pedido formal, para atender ventas de mostrador rápidamente.
*Fuente: `POST /api/sales`*

**US-12** — Como `warehouse`, quiero generar un código QR por producto y buscar imágenes de referencia para cada SKU, para facilitar el etiquetado físico y la identificación visual.
*Fuente: `GET /api/inventory/:sku/qr`, `GET /api/inventory/image-search`*

## Épica: Notificaciones y trazabilidad

**US-13** — Como `support` u `owner`, quiero ver el historial completo de eventos de un pedido (creado, confirmado, despachado, entregado), para auditar o resolver disputas.
*Fuente: `GET /api/notifications/order/:id`*

**US-14** — Como `warehouse`, quiero recibir una notificación push cuando el stock de un producto baja a nivel crítico, para reaccionar antes de quedarme sin inventario.
*Fuente: `POST /api/notifications/alert`, Web Push*

**US-15** — Como `ops`, quiero ver alertas automáticas de riesgo climático en la ruta de un envío, para anticipar retrasos.
*Fuente: `GET /api/notifications/weather-alert`, integración Open-Meteo*

## Épica: Administración y acceso

**US-16** — Como `owner`, quiero crear y administrar usuarios con roles específicos, para controlar quién accede a qué parte del sistema.
*Fuente: `POST /api/auth/register`, `GET/PUT/DELETE /api/auth/users`*

**US-17** — Como cualquier usuario, quiero recuperar mi contraseña respondiendo una pregunta secreta, sin depender de un email de recuperación, para no bloquearme del sistema si pierdo acceso a mi correo.
*Fuente: `security-module.js`, flujo de pregunta secreta*

## Épica: Multi-tenancy (parcialmente implementada)

**US-18** — Como operador de la plataforma (rol de plataforma, no un rol de negocio existente hoy), quiero que los datos de cada empresa cliente estén completamente aislados de las demás, para poder ofrecer Logify como SaaS a múltiples empresas sin riesgo de fuga de datos entre ellas.
*Fuente: `wiki/Multi-Tenant.md` Fase 4A-4C, implementado y verificado con tenant de prueba `acme`*

**US-19 (pendiente)** — Como nueva empresa interesada, quiero poder registrarme y obtener mi propio subdominio sin intervención manual del administrador de la plataforma, para empezar a usar Logify de forma self-service.
*Fuente: `wiki/Multi-Tenant.md` Fase 4E — ⚠️ no implementado, historia inferida del roadmap, no de código existente*

---
⚠️ **Nota:** estas historias fueron reconstruidas desde el comportamiento del sistema (ingeniería inversa), no desde un backlog original. No tienen estimaciones (story points), prioridad formal, ni fueron escritas/aprobadas por un Product Owner. Útiles como documentación de comportamiento actual, no como proceso de descubrimiento de producto.
