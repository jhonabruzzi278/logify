# shipping-service

Microservicio de envíos y tracking. Node.js 22 + Express 4 + PostgreSQL.

---

## Responsabilidad

- Creación de envíos y generación de números de tracking (`TRACK-XXXXXXXX`)
- Control de etapas del despacho
- Validación de entrega: cruza código del cliente + RUT del receptor antes de marcar como `ENTREGADO`
- Generación de código QR por envío
- Notificación de cambios de etapa al notification-service

---

## Puerto

`8084` | Base de datos: `shipping_db`

---

## Dependencias

- express, pg, helmet, cors, express-rate-limit, uuid, qrcode
- shared/ (app, db, logger, validate, security)

---

## Endpoints

Todos requieren JWT (`Authorization: Bearer <token>`).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/shipments` | Listar todos los envíos |
| GET | `/api/shipments/:orderId` | Buscar envío por ID de orden |
| POST | `/api/shipments` | Crear envío `{orderId, customerId, sku, quantity}` → `TRACK-XXXXXXXX` |
| PUT | `/api/shipments/:id/stage?stage=X` | Cambiar etapa (ver validación ENTREGADO abajo) |
| GET | `/api/shipments/:id/qr` | Código QR del envío (PNG base64) |
| GET | `/api/shipments/:id/qr-image?size=WxH` | Código QR del envío (PNG binario) |
| GET | `/api/shipments/:id/weather` | Clima en destino + riesgo de entrega (Open-Meteo) |
| GET | `/api/shipments/:id/route` | Distancia/duración/ruta al destino (OSRM) |

---

## Etapas del envío

| Etapa | Descripción |
|-------|-------------|
| `EN_PREPARACION` | En preparación en bodega |
| `EN_REPARTO` | En camino al cliente |
| `ENTREGADO` | Entregado — requiere validación |
| `CANCELADO` | Envío cancelado |

---

## Tracking

Al crear un envío se genera automáticamente un número de tracking con formato `TRACK-XXXXXXXX` (8 caracteres hexadecimales aleatorios en mayúscula). Este número se usa para trazabilidad interna y en el QR de retiro.

---

## Validación de entrega (ENTREGADO)

Al marcar como `ENTREGADO`, el body debe incluir:

```json
{
  "customerCode": "SL-XXXXXX",
  "recipientRut": "12.345.678-9",
  "proofOfDeliveryImage": "data:image/jpeg;base64,..."
}
```

El shipping-service verifica contra orders-service:
1. `customerCode` debe coincidir con `orders.client_code` de la orden asociada
2. `recipientRut` debe coincidir con `customers.rut` del cliente de esa orden

Si cualquiera de las dos validaciones falla, retorna `400` y la etapa no cambia.

**Por qué importa la doble validación:** el transportista no conoce el `SL-XXXXXX` (el backend lo omite en sus respuestas). Debe pedírselo físicamente al cliente. Esto garantiza que la entrega fue hecha a la persona correcta.

---

## Notificación de eventos

Al cambiar la etapa de cualquier envío, el servicio publica el evento en notification-service:

```
POST /api/notifications {orderId, stage, timestamp, audience}
```

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 8084 | Puerto HTTP |
| `DB_URL` | `postgresql://postgres:postgres@postgres-db:5432/shipping_db` | Conexión BD |
| `JWT_SECRET` | — | Secreto compartido para verificar JWT |
| `NOTIFICATION_SERVICE_URL` | `http://notification-service:8085` | URL notification-service |
| `ORDERS_SERVICE_URL` | `http://orders-service:8081` | URL orders-service (para validar entrega) |

---

## Pruebas

```bash
cd Backend/shipping-service
npm test   # jest --coverage — 28 pruebas, reporte en coverage/index.html
```
