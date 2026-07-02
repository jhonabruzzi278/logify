# orders-service

Microservicio de gestión de pedidos y clientes. Node.js 22 + Express 4 + PostgreSQL.

---

## Responsabilidad

- Ciclo de vida completo de pedidos: creación, confirmación (orquestador Saga), cancelación, asignación y eliminación
- CRUD de clientes (con RUT)
- Generación del código de cliente `SL-XXXXXX` al crear una orden
- **RLS por rol**: elimina `client_code` del response para los roles `shipper`, `customer` y `vendor`
- Endpoint de tracking público (`/track/:clientCode`) sin autenticación

---

## Puerto

`8081` | Base de datos: `orders_db`

---

## Dependencias

- express, pg, helmet, cors, express-rate-limit, nodemailer
- shared/ (app, db, logger, validate, security, email)

---

## Endpoints — Órdenes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/orders/test` | Health check |
| GET | `/api/orders/track/:clientCode` | **Tracking público** — solo campos seguros (sin email/teléfono) |
| GET | `/api/orders/report` | Reporte JOIN orders+customers (stored procedure) |
| GET | `/api/orders` | Listar órdenes (`client_code` omitido para shipper/customer/vendor) |
| GET | `/api/orders/:id` | Detalle de orden (RLS aplicada) |
| POST | `/api/orders` | Crear orden `{customerId, sku, quantity}` → devuelve `customerCode` |
| PUT | `/api/orders/:id/confirm` | Confirmar: descuenta stock + crea envío + `EN_PREPARACION` |
| PUT | `/api/orders/:id/cancel` | Cancelar `{reason}` — restaura stock si aplica |
| PUT | `/api/orders/:id/status?status=X` | Cambiar estado manualmente |
| PUT | `/api/orders/:id/assign?transporter=X` | Asignar transportista |
| DELETE | `/api/orders/:id` | Eliminar orden |

## Endpoints — Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/customers` | Listar clientes |
| GET | `/api/customers/:id` | Detalle de cliente |
| POST | `/api/customers` | Crear cliente `{name, phone, address, email, rut}` |
| PUT | `/api/customers/:id` | Actualizar cliente (incluyendo RUT) |
| DELETE | `/api/customers/:id` | Eliminar cliente |

---

## Estados de orden

| Estado | Descripción |
|--------|-------------|
| `CREATED` | Pendiente de confirmación |
| `EN_PREPARACION` | Confirmado — stock descontado, envío generado |
| `EN_REPARTO` | En camino al cliente |
| `ENTREGADO` | Entregado exitosamente |
| `CANCELADO` | Cancelado (incluye motivo) |

---

## Código de cliente (SL-XXXXXX)

Al crear una orden, el servicio genera automáticamente un código único con formato `SL-XXXXXX` (prefijo fijo + 6 caracteres alfanuméricos en mayúscula). Este código:

- Se incluye en el email de confirmación enviado al cliente
- Es el único identificador que el cliente necesita para rastrear su pedido
- **Nunca se devuelve** en los endpoints de listado/detalle cuando el rol es `shipper`, `customer` o `vendor`
- El transportista **nunca lo ve** — debe pedírselo al cliente en persona para confirmar la entrega

---

## Row-Level Security (RLS)

El servicio extrae el rol del JWT en cada request (claim `role`, emitido por `POST /api/auth/login`):

```
RESTRICTED_ROLES = ['shipper', 'customer', 'vendor']
```

- `GET /api/orders` y `GET /api/orders/:id`: eliminan `client_code` del response para roles restringidos
- `GET /api/orders/track/:clientCode`: endpoint público — devuelve solo `id`, `sku`, `quantity`, `status`, `created_at`, `client_code`, `cancel_reason`, `customer_name` (sin email ni teléfono)

---

## Saga de confirmación

```
PUT /api/orders/:id/confirm
  │
  ├─► POST inventory-service /api/inventory/:sku/adjust?delta=-N
  │     └── Descuenta stock
  │
  ├─► POST shipping-service /api/shipments
  │     └── Crea envío (TRACK-XXXXXXXX) + notifica notification-service
  │
  └─► UPDATE orders SET status='EN_PREPARACION'
```

Al cancelar una orden `EN_PREPARACION` o `EN_REPARTO`:
1. Restaura stock: `adjust?delta=+N`
2. Cancela el envío: `PUT /api/shipments/:id/stage?stage=CANCELADO`

---

## Stored Procedures

| Función | Descripción |
|---------|-------------|
| `fn_get_orders_with_customer(p_status)` | Reporte con datos de cliente JOIN |
| `fn_cancel_order(p_order_id, p_reason)` | Cancelación atómica de orden |

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 8081 | Puerto HTTP |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres-db:5432/orders_db` | Conexión BD |
| `INVENTORY_SERVICE_URL` | `http://inventory-service:8082` | URL inventory-service |
| `SHIPPING_SERVICE_URL` | `http://shipping-service:8084` | URL shipping-service |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | Configuración correo |

---

## Pruebas

```bash
cd Backend/orders-service
npm test
npm test -- --coverage   # Reporte en coverage/index.html
```
