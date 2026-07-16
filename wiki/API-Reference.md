# API Reference

Todos los endpoints expuestos por el API Gateway en `http://localhost:8080`.

---

## Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/healthz` | Estado del sistema (gateway) |
| GET | `/api/orders/test` | Health check orders-service |

---

## Auth

Sistema de autenticación JWT propio (sin proveedores externos). Manejado por `orders-service`.

### Login

```
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "..." }
```

Valida contra la tabla `users` (contraseñas con `bcrypt`) y devuelve un JWT firmado con `JWT_SECRET`.

**Respuesta 200:**
```json
{ "token": "eyJ...", "role": "owner", "name": "Admin", "username": "admin" }
```

---

### Registrar usuario

```
POST /api/auth/register
Content-Type: application/json

{ "username": "nuevo", "password": "...", "name": "Nuevo Usuario", "role": "ops" }
```

Requiere rol `owner`/`admin`. Roles válidos: `owner`, `ops`, `warehouse`, `shipper`, `vendor`, `support`, `customer`.

---

### Listar / editar / eliminar usuarios

```
GET /api/auth/users
PUT /api/auth/users/:id
DELETE /api/auth/users/:id
```

Requiere rol `owner`/`admin`.

---

## Orders

### Tracking público (sin autenticación)

```
GET /api/orders/track/:clientCode
```

Devuelve el estado del pedido asociado al código `SL-XXXXXX`. Solo campos seguros — sin email ni teléfono del cliente.

**Parámetros de ruta:** `clientCode` — formato `SL-XXXXXX` (case-insensitive)

**Respuesta 200:**
```json
{
  "id": 1,
  "sku": "COCA-2L",
  "quantity": 3,
  "status": "EN_PREPARACION",
  "created_at": "2026-06-20T14:30:00Z",
  "client_code": "SL-AB12CD",
  "cancel_reason": null,
  "customer_name": "María González"
}
```

**Respuesta 404:**
```json
{ "error": "Código de cliente no encontrado" }
```

---

### Listar órdenes

```
GET /api/orders
```

Requiere autenticación (JWT en header `Authorization: Bearer <token>`).  
Para roles `shipper`, `customer` y `vendor`, el campo `client_code` se omite del response.

**Query params opcionales:**
- `limit` (int) — registros por página
- `page` (int) — número de página

---

### Reporte de órdenes

```
GET /api/orders/report?status=CREATED
```

Ejecuta el stored procedure `fn_get_orders_with_customer`. Devuelve órdenes con datos del cliente (nombre, email).

**Query params:** `status` (opcional) — filtra por estado

---

### Detalle de orden

```
GET /api/orders/:id
```

`client_code` omitido para roles restringidos.

---

### Crear orden

```
POST /api/orders
Content-Type: application/json

{
  "customerId": 1,
  "sku": "COCA-2L",
  "quantity": 3
}
```

**Respuesta 201:**
```json
{
  "orderId": 1,
  "status": "CREATED",
  "sku": "COCA-2L",
  "quantity": 3,
  "customerId": 1,
  "customerCode": "SL-AB12CD",
  "message": "Orden creada correctamente",
  "createdAt": "2026-06-20T14:30:00Z"
}
```

---

### Confirmar orden (Saga)

```
PUT /api/orders/:id/confirm
```

Descuenta stock, crea envío y actualiza estado a `EN_PREPARACION`.  
Si algún paso falla, devuelve `warnings` pero la orden avanza.

---

### Cancelar orden

```
PUT /api/orders/:id/cancel
Content-Type: application/json

{ "reason": "Motivo de cancelación" }
```

Restaura stock y cancela envío si la orden estaba `EN_PREPARACION` o `EN_REPARTO`.

---

### Cambiar estado manualmente

```
PUT /api/orders/:id/status?status=EN_REPARTO
```

Estados válidos: `CREATED`, `EN_PREPARACION`, `EN_REPARTO`, `ENTREGADO`, `CANCELADO`

---

### Asignar transportista

```
PUT /api/orders/:id/assign?transporter=transportista
```

---

### Eliminar orden

```
DELETE /api/orders/:id
```

---

### Comprobante de pedido en PDF

```
GET /api/orders/:id/pdf
```

Genera un PDF (vía `pdfkit`) con el detalle del pedido y los datos del cliente asociado. Descarga como `orden-<id>.pdf`.

---

## Customers

### Listar clientes

```
GET /api/customers
```

---

### Detalle de cliente

```
GET /api/customers/:id
```

---

### Crear cliente

```
POST /api/customers
Content-Type: application/json

{
  "name": "María González",
  "phone": "+56912345678",
  "address": "Av. Principal 123",
  "email": "maria@ejemplo.cl",
  "rut": "12.345.678-9"
}
```

---

### Actualizar cliente

```
PUT /api/customers/:id
Content-Type: application/json

{
  "name": "María González",
  "phone": "+56987654321",
  "address": "Nueva Dirección 456",
  "email": "nueva@ejemplo.cl",
  "rut": "12.345.678-9"
}
```

---

### Eliminar cliente

```
DELETE /api/customers/:id
```

---

### Validar RUT chileno

```
GET /api/customers/validate-rut?rut=12345678-9
```

Sin autenticación. Calcula el dígito verificador módulo 11 y valida el formato.

**Respuesta 200:**
```json
{ "valid": true, "formatted": "12.345.678-5", "digitoVerificador": "5" }
```

---

### Autocompletar dirección

```
GET /api/customers/address-suggest?q=Av. Principal 123
```

Sugerencias de direcciones vía [Nominatim (OpenStreetMap)](https://nominatim.org/), acotado a Chile (`q` mínimo 3 caracteres). Devuelve hasta 5 resultados con `displayName`, `lat`, `lon` y detalle de dirección.

---

## Inventory

### Listar productos

```
GET /api/inventory
```

---

### Reporte de inventario

```
GET /api/inventory/report
```

Ejecuta `fn_inventory_report()`. Devuelve productos clasificados por nivel de stock (crítico, bajo, normal).

---

### Consultar SKU

```
GET /api/inventory/:sku
```

---

### Agregar producto

```
POST /api/inventory
Content-Type: application/json

{ "sku": "COCA-2L", "stock": 100 }
```

---

### Actualizar stock

```
PUT /api/inventory/:sku
Content-Type: application/json

{ "stock": 150 }
```

---

### Eliminar producto

```
DELETE /api/inventory/:sku
```

---

### Ajustar stock (stored procedure)

```
POST /api/inventory/:sku/adjust?delta=-3
POST /api/inventory/:sku/adjust?delta=+5
```

`delta` puede ser positivo (ingreso) o negativo (egreso). La función valida que el stock no quede en negativo.

---

### Reporte de inventario en PDF

```
GET /api/inventory/report/pdf
```

Genera un PDF (vía `pdfkit`) con el listado de productos, totales por nivel de stock (sin stock, crítico, bajo) y detalle tabular. Descarga como `inventario.pdf`.

---

### QR de un producto

```
GET /api/inventory/:sku/qr?size=200x200
```

Devuelve una imagen PNG con el código QR del SKU (contenido `LOGIFY-SKU:<sku>`), generada vía [QR Server API](https://goqr.me/api/).

---

### Geocodificar una dirección

```
GET /api/inventory/geocode?address=Av. Principal 123
```

Resuelve una dirección a coordenadas usando [Nominatim (OpenStreetMap)](https://nominatim.org/), acotado a Chile. Devuelve hasta 5 resultados con `displayName`, `lat`, `lon` y detalle de dirección.

---

### Indicadores económicos

```
GET /api/inventory/indicadores
```

Devuelve UF, dólar y UTM del día vía [mindicador.cl](https://mindicador.cl/), con caché en memoria de 1 hora para no golpear la API externa en cada request.

**Respuesta 200:**
```json
{
  "uf": { "valor": 38541.12, "fecha": "..." },
  "dolar": { "valor": 943.55, "fecha": "..." },
  "utm": { "valor": 68923, "fecha": "..." }
}
```

---

### Buscar imágenes de producto

```
GET /api/inventory/image-search?q=laptop
```

Busca imágenes con licencia abierta vía [Openverse](https://openverse.org/) (`q` mínimo 2 caracteres). Devuelve hasta 8 resultados con `id`, `title`, `thumbnail`, `url`, `creator` y `license`.

---

### Asignar imagen a un producto

```
PUT /api/inventory/:sku/image
Content-Type: application/json

{ "imageUrl": "https://..." }
```

Guarda la URL en la columna `inventory.image_url`. Responde 404 si el SKU no existe.

---

## Sales

### Listar ventas

```
GET /api/sales
```

---

### Registrar venta

```
POST /api/sales
Content-Type: application/json

{ "sku": "COCA-2L", "quantity": 2 }
```

Descuenta stock directamente (flujo POS, sin crear orden).

---

## Shipments

### Listar envíos

```
GET /api/shipments
```

---

### Envío por ID de orden

```
GET /api/shipments/:orderId
```

---

### Crear envío

```
POST /api/shipments
Content-Type: application/json

{
  "orderId": 1,
  "customerId": 1,
  "sku": "COCA-2L",
  "quantity": 3
}
```

**Respuesta 201:**
```json
{
  "id": 1,
  "order_id": 1,
  "tracking": "TRACK-A1B2C3D4",
  "stage": "EN_PREPARACION",
  "created_at": "..."
}
```

---

### Cambiar etapa del envío

```
PUT /api/shipments/:id/stage?stage=EN_REPARTO
```

Para `ENTREGADO`, incluir en el body:

```json
{
  "customerCode": "SL-AB12CD",
  "recipientRut": "12.345.678-9",
  "proofOfDeliveryImage": "data:image/jpeg;base64,..."
}
```

El sistema valida `customerCode` y `recipientRut` antes de aceptar el cambio.

**Etapas válidas:** `EN_PREPARACION`, `EN_REPARTO`, `ENTREGADO`, `CANCELADO`

---

### QR del envío

```
GET /api/shipments/:id/qr
```

Devuelve la imagen QR en formato PNG base64.

---

### QR del envío (imagen binaria)

```
GET /api/shipments/:id/qr-image?size=250x250
```

Igual que `/qr`, pero devuelve el PNG directamente (`Content-Type: image/png`) en vez de base64, generado vía [QR Server API](https://goqr.me/api/).

---

### Clima en destino del envío

```
GET /api/shipments/:id/weather?lat=&lon=
```

Consulta el clima actual vía [Open-Meteo](https://open-meteo.com/) para evaluar riesgo de entrega. Si no se pasan `lat`/`lon`, geocodifica la dirección del cliente asociado (Nominatim); si tampoco hay dirección, usa Santiago como fallback.

**Respuesta 200:**
```json
{
  "shipmentId": 1,
  "trackingNumber": "TRACK-A1B2C3D4",
  "location": { "lat": -33.4489, "lon": -70.6693 },
  "weather": { "temperature": 18.2, "humidity": 60, "precipitation": 0, "windSpeed": 12, "condition": "Despejado", "weatherCode": 0 },
  "deliveryRisk": "BAJO",
  "recommendation": "Condiciones normales para la entrega"
}
```

`deliveryRisk` es `ALTO` cuando `weatherCode >= 51` (lluvia, nieve o tormenta).

---

### Ruta al destino del envío

```
GET /api/shipments/:id/route?origin_lat=&origin_lon=&dest_lat=&dest_lon=
```

Calcula distancia, duración y geometría de la ruta vía [OSRM](http://project-osrm.org/) (`router.project-osrm.org`). El origen por defecto es la bodega en Santiago; si no se pasa destino, geocodifica la dirección del cliente asociado. Responde `400` si no se puede determinar un destino.

**Respuesta 200:**
```json
{
  "shipmentId": 1,
  "trackingNumber": "TRACK-A1B2C3D4",
  "distanceKm": 12.4,
  "durationMin": 22,
  "origin": { "lat": -33.4489, "lon": -70.6693, "label": "Bodega Logify" },
  "destination": { "lat": -33.45, "lon": -70.66 },
  "geometry": { "type": "LineString", "coordinates": [ ] }
}
```

---

## Notifications

### Registrar evento

```
POST /api/notifications
Content-Type: application/json

{
  "orderId": 1,
  "event": "SHIPMENT_EN_REPARTO",
  "audience": "customer",
  "message": "Tu pedido está en camino"
}
```

---

### Trazabilidad de orden

```
GET /api/notifications/order/:id
```

Devuelve todos los eventos de una orden en orden cronológico.

---

### Notificaciones por audiencia

```
GET /api/notifications/audience/:audience
```

Audiencias: `customer`, `ops`, `shipper`, `system`

---

### Alerta climática

```
GET /api/notifications/weather-alert?lat=&lon=
```

Consulta el clima actual vía [Open-Meteo](https://open-meteo.com/) (fallback: Santiago). Si las condiciones son adversas (`weatherCode >= 51`), registra automáticamente un evento `WEATHER_ALERT` en `notification_records` con audiencia `OPERATOR`.

**Respuesta 200:**
```json
{
  "alert": true,
  "condition": "Lluvia",
  "message": "Alerta climática: Lluvia — viento 24 km/h, precipitación 3.2 mm",
  "weather": { "temperature": 14.1, "windSpeed": 24, "precipitation": 3.2, "weatherCode": 61 },
  "location": { "lat": -33.4489, "lon": -70.6693 },
  "eventId": "weather-1735689600000"
}
```

---

### Historial de notificaciones en PDF

```
GET /api/notifications/report/pdf
```

Genera un PDF (vía `pdfkit`) con las últimas 200 notificaciones registradas. Descarga como `notificaciones.pdf`.

---

### QR genérico

```
GET /api/notifications/qr?text=LOGIFY-TRACK123&size=200x200
```

Genera un código QR PNG a partir de cualquier texto, vía [QR Server API](https://goqr.me/api/).

---

### Alerta de stock manual

```
POST /api/notifications/alert
Content-Type: application/json

{ "message": "Stock crítico en COCA-2L" }
```

Registra un evento `STOCK_ALERT` con audiencia `OPERATOR` y dispara una notificación push a los navegadores suscritos.

---

### Notificaciones Web Push

```
GET  /api/notifications/push/vapid-public-key
POST /api/notifications/push/subscribe      { endpoint, keys: { p256dh, auth } }
DELETE /api/notifications/push/subscribe    { endpoint }
```

El frontend obtiene la clave pública VAPID, se suscribe con el service worker (`PushManager.subscribe`) y registra la suscripción. Cada evento persistido dispara `broadcastPush()` a todas las suscripciones; las vencidas (404/410) se eliminan automáticamente. Requiere `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` en el entorno (generar con `npx web-push generate-vapid-keys`).

---

### Limpiar historial

```
DELETE /api/notifications
```

Elimina todos los registros de notificaciones (uso administrativo).

---

## Integraciones externas

| Servicio | Uso | Microservicios |
|----------|-----|-----------------|
| [Nominatim (OpenStreetMap)](https://nominatim.org/) | Geocodificación de direcciones (acotado a Chile) | orders, inventory, shipping |
| [Open-Meteo](https://open-meteo.com/) | Clima actual para alertas y evaluación de riesgo de entrega | notifications, shipping |
| [OSRM](http://project-osrm.org/) | Cálculo de rutas y distancias | shipping |
| [QR Server](https://goqr.me/api/) | Generación de códigos QR (PNG) | inventory, notifications, shipping |
| [mindicador.cl](https://mindicador.cl/) | Indicadores económicos UF/dólar/UTM (caché 1h) | inventory |
| [Openverse](https://openverse.org/) | Búsqueda de imágenes de producto con licencia abierta | inventory |
| [web-push (VAPID)](https://github.com/web-push-libs/web-push) | Notificaciones push del navegador | notifications |
| [pdfkit](https://pdfkit.org/) | Generación local de reportes PDF (sin dependencia externa en runtime) | inventory, orders, notifications |

Estas integraciones son llamadas server-side; no requieren API keys, pero sí conectividad saliente a internet desde los contenedores de cada microservicio.

---

## Códigos de respuesta

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado correctamente |
| 400 | Datos inválidos o validación fallida |
| 401 | Token JWT ausente, inválido o expirado |
| 404 | Recurso no encontrado |
| 409 | Duplicado (SKU existente, evento ya procesado) |
| 500 | Error interno del servidor |

> Salvo `/healthz`, `/api/auth/login`, `/api/orders/test`, `/api/orders/track/:clientCode` y `/api/customers/validate-rut`, **todos los endpoints requieren** el header `Authorization: Bearer <token>`.
