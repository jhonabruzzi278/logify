# Logify — Backend

Cuatro microservicios Node.js 22 + Express 4 + PostgreSQL 15, orquestados con Docker Compose y expuestos a través de un API Gateway Nginx en el puerto 8080.

---

## Servicios

| Servicio | Puerto | BD | Responsabilidad |
|----------|--------|----|----------------|
| orders-service | 8081 | orders_db | Pedidos, clientes, RLS por rol |
| inventory-service | 8082 | inventory_db | Control de stock y ventas |
| shipping-service | 8084 | shipping_db | Envíos, tracking, entrega validada |
| notification-service | 8085 | notification_db | Trazabilidad y auditoría |
| nginx (BFF) | **8080** | — | API Gateway / reverse proxy |

---

## Levantar el backend

```bash
# Desde la raíz del proyecto (donde está docker-compose.yml)
docker compose up -d --build

# Verificar estado
docker compose ps

# Logs en tiempo real
docker compose logs -f

# Reconstruir un servicio específico
docker compose up -d --build orders-service

# Detener todo
docker compose down

# Detener y borrar datos (volumen BD)
docker compose down -v
```

Verificación rápida:
```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/orders/test
```

---

## Estructura de cada microservicio

```
servicio/
├── Dockerfile         # Node.js 22 Alpine
├── package.json
└── src/
    └── index.js       # App Express con rutas REST
```

---

## Shared Modules (`Backend/shared/`)

Código reutilizado por todos los servicios sin duplicar:

| Módulo | Función |
|--------|---------|
| `app.js` | Factory de apps Express (`createApp`), helper `interServiceFetch` |
| `db.js` | Pool de conexiones PostgreSQL con reintentos |
| `logger.js` | Logging estructurado con niveles configurables |
| `validate.js` | Validación de body y estados de órdenes |
| `security.js` | Helmet, CORS, rate limiting |
| `email.js` | `sendEmail` + `buildOrderConfirmationEmail` (Nodemailer + HTML) |

---

## Comunicación entre servicios

Los servicios se comunican de forma síncrona via REST usando `interServiceFetch()` del shared module. Flujo principal:

```
POST /api/orders (crea orden con SL-XXXXXX)
  └── PUT /api/orders/:id/confirm
        ├── POST /api/inventory/:sku/adjust?delta=-N   (descuenta stock)
        ├── POST /api/shipments                         (crea envío TRACK-XXXXXXXX)
        └── UPDATE orders SET status='EN_PREPARACION'
```

Al cancelar una orden en estado `EN_PREPARACION` o `EN_REPARTO`:
- Se restaura el stock (`adjust?delta=+N`)
- Se cancela el envío asociado (`PUT /stage?stage=CANCELADO`)

---

## Inicialización de bases de datos

Cada servicio crea sus tablas al arrancar con `CREATE TABLE IF NOT EXISTS` — no requiere migraciones manuales.

Para cargar datos de prueba:
```bash
docker exec -i logify-db psql -U postgres -d orders_db < Backend/seed.sql
```

`seed.sql` incluye productos, clientes, pedidos, envíos y notificaciones de ejemplo.

---

## Stored Procedures

| Función | Servicio | Descripción |
|---------|----------|-------------|
| `fn_get_orders_with_customer(p_status)` | orders | Reporte JOIN orders + customers |
| `fn_cancel_order(p_order_id, p_reason)` | orders | Cancelación atómica de orden |
| `fn_adjust_stock(p_sku, p_delta)` | inventory | Ajuste de stock con validación |
| `fn_inventory_report()` | inventory | Clasificación por nivel de stock |

---

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `DB_URL` | Cadena de conexión PostgreSQL |
| `PORT` | Puerto interno del servicio |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma y expiración de los JWT (compartidos por todos los servicios) |
| `INVENTORY_SERVICE_URL` | URL del inventory-service |
| `SHIPPING_SERVICE_URL` | URL del shipping-service |
| `NOTIFICATION_SERVICE_URL` | URL del notification-service |
| `ORDERS_SERVICE_URL` | URL del orders-service (usado por shipping) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (notification-service) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Correo (opcional) |
| `PLATFORM_ADMIN_KEY` (orders-service) | Secreto compartido para `POST/GET /api/admin/coupons` (gestión de cupones de bienvenida del signup self-service, ver [wiki/Multi-Tenant.md](../wiki/Multi-Tenant.md#fases) Fase 4E). Sin esta variable, esos endpoints responden 503. Se envía como header `X-Admin-Key`. |
| `SIGNUP_RATE_LIMIT_MAX` (orders-service) | Máximo de registros por IP cada 15 min en `POST /api/signup` (default `5`) |
| `SIGNUP_ENABLED` (orders-service) | Habilita el onboarding público central. Producción lo sincroniza como `true` desde el workflow de despliegue. |

### Gestión de cupones (Fase 4E, sin panel de super-admin)

Con `PLATFORM_ADMIN_KEY` seteado en orders-service:

```bash
# Crear un cupón que regala 90 días extra de demo, uso único por tenant, sin límite de canjes
curl -X POST https://api.logify.cl/api/admin/coupons \
  -H "X-Admin-Key: $PLATFORM_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"code":"BIENVENIDA90","extraTrialDays":90}'

# Listar cupones
curl https://api.logify.cl/api/admin/coupons -H "X-Admin-Key: $PLATFORM_ADMIN_KEY"
```

---

## Pruebas

```bash
# npm test ya incluye cobertura (jest --coverage)
cd Backend/orders-service && npm test        # 187 pruebas
cd Backend/inventory-service && npm test     # 122 pruebas
cd Backend/shipping-service && npm test      # 59 pruebas
cd Backend/notification-service && npm test  # 67 pruebas
```

Reportes generados en `coverage/index.html` de cada servicio. Detalle y cobertura actual en [wiki/Pruebas.md](../wiki/Pruebas.md).
