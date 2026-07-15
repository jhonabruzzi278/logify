# notification-service

Microservicio de trazabilidad y auditoria. Node.js 22 + Express 4 + PostgreSQL.

## Responsabilidad

Persiste eventos de notificacion generados por los otros microservicios, proporcionando trazabilidad completa del ciclo de vida de cada pedido. Actua como registro de auditoria.

## Puerto

`8085` | Base de datos: `notification_db`

## Dependencias

- express, pg, helmet, cors, express-rate-limit, jsonwebtoken, pdfkit, web-push
- shared/ (app, db, logger, validate, security, shutdown)

## Endpoints

Todos requieren JWT (`Authorization: Bearer <token>`).

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | /api/notifications | Persistir evento de notificacion (idempotente) |
| GET | /api/notifications/order/:id | Trazabilidad completa de un pedido |
| GET | /api/notifications/audience/:aud | Filtrar por audiencia (CLIENT, OPERATOR, BOTH) |
| POST | /api/notifications/alert | Alerta de stock manual desde el frontend |
| GET | /api/notifications/weather-alert?lat=&lon= | Alerta climatica (Open-Meteo); registra evento si es adversa |
| GET | /api/notifications/report/pdf | Historial de notificaciones en PDF (pdfkit) |
| GET | /api/notifications/qr?text=X | QR generico (PNG) |
| GET | /api/notifications/push/vapid-public-key | Clave publica VAPID para Web Push |
| POST | /api/notifications/push/subscribe | Registrar suscripcion push del navegador |
| DELETE | /api/notifications/push/subscribe | Eliminar suscripcion push |
| DELETE | /api/notifications | Limpiar historial de notificaciones |

## Notificaciones Web Push

Cada evento persistido dispara `broadcastPush()` hacia todas las suscripciones
registradas (tabla `push_subscriptions`), firmado con las claves VAPID
(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en variables de entorno). Las
suscripciones vencidas (HTTP 404/410) se eliminan automaticamente.

## Estructura de un evento

```json
{
  "orderId": 1,
  "stage": "EN_PREPARACION",
  "status": "info",
  "message": "Pedido confirmado y en preparacion",
  "sourceService": "shipping-service",
  "targetAudience": "OPERATOR"
}
```

## Idempotencia

Los eventos tienen una restriccion de unicidad en `(event_id, target_audience)`. Si se intenta insertar un evento duplicado, el servicio responde `409 {"status":"DUPLICATE","eventId":...}` y no vuelve a procesarlo.

## Audiencias

- `CLIENT` - Visible para el cliente final
- `OPERATOR` - Visible para operadores/administradores
- `BOTH` - Visible para ambos

## Ejecucion

### Con Docker (recomendado)

```bash
# Desde la raiz del proyecto
docker compose up -d --build
```

### Sin Docker (desarrollo)

```bash
cd Backend/notification-service
npm install
DB_URL=postgresql://postgres:postgres@localhost:5432/notification_db node src/index.js
```

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| PORT | 8085 | Puerto HTTP |
| DB_URL | postgresql://postgres:postgres@postgres-db:5432/notification_db | Conexion BD |
| ALLOWED_ORIGINS | * | CORS origins |

## Pruebas Unitarias

### Ejecutar pruebas

```bash
npm test
```

`npm test` ya genera cobertura (`jest --coverage`); el reporte HTML queda en `coverage/index.html`.

### Cobertura actual

**26 pruebas** en verde (`src/index.test.js`). Cobertura de statements: **29,9 %**. La meta del equipo es 60% (no hay `coverageThreshold` configurado; ver [wiki/Pruebas.md](../../wiki/Pruebas.md)).
