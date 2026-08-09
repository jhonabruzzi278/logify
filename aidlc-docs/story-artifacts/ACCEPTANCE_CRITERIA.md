# Acceptance Criteria

Criterios de aceptación reconstruidos a partir del comportamiento real implementado (validado contra el código fuente y, donde existe, los tests correspondientes). Formato Given/When/Then. Cubre las historias más críticas de `USER_STORIES.md`.

## US-3 / US-14 (referencia): Confirmar un pedido (Saga)

- **Given** un pedido en estado `CREATED` con stock suficiente disponible
  **When** `ops` ejecuta `PUT /api/orders/:id/confirm`
  **Then** el stock del SKU se descuenta en inventory-service, se crea un envío en shipping-service con número `TRACK-XXXXXXXX`, y el pedido pasa a estado `EN_PREPARACION`.

- **Given** un pedido en estado `CREATED` con stock **insuficiente**
  **When** `ops` intenta confirmar el pedido
  **Then** inventory-service rechaza el ajuste y el pedido permanece en `CREATED`, sin intentar crear el envío.

- **Given** que la llamada a shipping-service falla durante la confirmación (después de ya haber descontado stock)
  **When** ocurre el fallo de red/servicio
  **Then** orders-service intenta restaurar automáticamente el stock y mantiene el pedido en `CREATED`; si también falla la restauración, agrega una advertencia explícita de revisión manual.

## US-6: Confirmar entrega con verificación de dos factores

- **Given** un envío en estado `EN_REPARTO`
  **When** el `shipper` envía `PUT /api/shipments/:id/stage?stage=ENTREGADO` con `customerCode` y `recipientRut` correctos (coinciden con `orders.client_code` y `customers.rut`)
  **Then** el envío pasa a `ENTREGADO`, se almacena la prueba de entrega (`proofOfDeliveryImage`), y se notifica al notification-service.

- **Given** el mismo escenario pero con `customerCode` o `recipientRut` incorrectos
  **When** el `shipper` intenta confirmar la entrega
  **Then** la API responde con error (`"Código de cliente o RUT incorrecto"`) y el estado del envío **no cambia**. *(Fuente: `wiki/Seguridad-y-RLS.md`)*

## US-16 (referencia FR-16): Ocultar `client_code` a roles restringidos

- **Given** un usuario autenticado con rol `shipper`, `customer` o `vendor`
  **When** consulta `GET /api/orders` o `GET /api/orders/:id`
  **Then** el campo `client_code` está ausente de la respuesta, **sin importar si el frontend intenta mostrarlo** (enforcement server-side, no solo UI). *(Fuente: `RESTRICTED_ROLES`, `stripClientCode()`)*

## US-7: Tracking público

- **Given** un código de cliente válido `SL-XXXXXX`
  **When** cualquier persona (sin autenticación) consulta `GET /api/orders/track/:clientCode`
  **Then** la respuesta incluye solo campos seguros (`id, sku, quantity, status, created_at, client_code, cancel_reason, customer_name`) y **excluye explícitamente** `customer_email, customer_phone, customer_address, rut`.

- **Given** un código de cliente inexistente
  **When** se consulta el endpoint de tracking
  **Then** la API debe responder 404 — ⚠️ no verificado explícitamente en esta auditoría, revisar contra tests existentes.

## US-8: Cancelar pedido y restaurar stock

- **Given** un pedido en estado `CREATED` o `EN_PREPARACION`
  **When** se ejecuta `PUT /api/orders/:id/cancel` con un motivo
  **Then** el pedido pasa a `CANCELADO`, se guarda `cancel_reason`, y el stock del SKU se restaura (`adjust?delta=+N`) si ya había sido descontado.

- **Given** un pedido ya en estado `EN_REPARTO` o `ENTREGADO`
  **When** se intenta cancelar
  **Then** ⚠️ comportamiento no verificado explícitamente durante esta auditoría (¿se permite? ¿se bloquea?) — recomendado como ítem de revisión de código.

## US-18: Aislamiento multi-tenant

- **Given** dos tenants distintos (`logify` por defecto y `acme` de prueba)
  **When** un usuario autenticado con JWT del tenant `acme` intenta acceder a datos
  **Then** solo ve datos con `tenant_id` correspondiente a `acme`, nunca datos de `logify` u otro tenant. Verificado manualmente según `wiki/Multi-Tenant.md` ("aislamiento de datos confirmado").

- **Given** un JWT válido emitido para el tenant `acme`
  **When** se usa ese token contra un subdominio/contexto que resuelve a un tenant distinto
  **Then** la request es rechazada con 403 (previene reuso cross-tenant de tokens). Verificado según `wiki/Multi-Tenant.md`.

## US-20: Portal central de empresa

- **Given** una persona abre `app.logify.cl`
  **When** ingresa un slug válido
  **Then** el frontend la redirige a `https://<slug>.logify.cl/login` sin intentar autenticarla en el host neutral.

- **Given** una invitación válida aceptada desde `app.logify.cl`
  **When** el backend crea al usuario
  **Then** responde con `tenantSlug` y el frontend continúa en el subdominio correcto.

## US-21 / US-22: Actualización PWA y calendario

- **Given** que Vercel publica una versión nueva
  **When** el service worker nuevo toma control
  **Then** la pestaña se recarga una sola vez y `sw.js` se revalida sin caché intermedia.

- **Given** una respuesta de `/api/shipments`
  **When** se renderiza el calendario
  **Then** solo aparecen los envíos presentes en esa respuesta; el frontend no genera tracking, fechas ni registros sintéticos.

---
⚠️ **Nota general:** estos criterios se derivaron leyendo el código de producción, no de una suite de tests exhaustiva revisada línea por línea durante esta auditoría automática. Varios casos límite están marcados explícitamente como "no verificado" — se recomienda que el equipo los confirme y los convierta en tests automatizados si no existen ya (ver `testing/TEST_STRATEGY.md` para gaps de cobertura conocidos).
