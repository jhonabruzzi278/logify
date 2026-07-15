# SmartLogix — Plataforma de Gestión Logística

**Repositorio:** https://github.com/jhonabruzzi278/smartlogix-eva  
**Frontend (Vercel):** https://smartlogix-five.vercel.app

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Frontend  React 18 + TypeScript + Vite   :3000     │
└──────────────────────┬──────────────────────────────┘
                       │ /api/*  (proxy Vite)
┌──────────────────────▼──────────────────────────────┐
│  API Gateway / BFF   Nginx Alpine          :8080     │
└──────┬───────────┬──────────────┬───────────────────┘
       │           │              │
┌──────▼──┐  ┌────▼────┐  ┌──────▼──┐  ┌──────────────┐
│ orders  │  │inventory│  │shipping │  │notification  │
│ :8081   │  │ :8082   │  │ :8084   │  │   :8085      │
└──────┬──┘  └────┬────┘  └──────┬──┘  └──────────────┘
       │           │              │
┌──────▼───────────▼──────────────▼────────────────────┐
│          PostgreSQL 15  (4 bases independientes)      │
│  orders_db  inventory_db  shipping_db  notification_db│
└───────────────────────────────────────────────────────┘
```

**Flujo Saga:** `POST /orders/confirm` → descuenta stock (inventory) → crea envío (shipping) → genera notificación (notification)

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, TypeScript 5.7, Vite 6, Tailwind CSS, shadcn/ui, PWA |
| BFF | Nginx Alpine (reverse proxy, puerto 8080) |
| Microservicios | Node.js 22, Express 4, pg (PostgreSQL driver), pdfkit (reportes PDF) |
| Base de datos | PostgreSQL 15 Alpine, 1 DB por servicio |
| Infraestructura | Docker Desktop, Docker Compose |
| Auth | JWT local (usuarios y contraseñas con bcrypt, tabla `users` en orders-service) |

---

## Inicio rápido

### Requisitos

- Docker Desktop instalado y corriendo
- Node.js 22 (solo para el frontend en desarrollo)

### 1. Levantar el backend completo

```bash
# Desde la raíz del proyecto
docker compose up -d --build

# Verificar contenedores
docker compose ps
```

| Contenedor | Puerto local | Descripción |
|-----------|-------------|-------------|
| smartlogix-db | 5432 | PostgreSQL (4 DBs) |
| smartlogix-orders | 8081 | orders-service |
| smartlogix-inventory | 8082 | inventory-service |
| smartlogix-shipping | 8084 | shipping-service |
| smartlogix-notification | 8085 | notification-service |
| smartlogix-api-gateway | **8080** | Nginx BFF (punto único de entrada) |

### 2. Verificar el backend

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/orders/test
```

### 3. Levantar el frontend en desarrollo

```bash
cd Frontend
npm install
npm run dev
# Abre http://localhost:3000
```

El proxy de Vite redirige automáticamente `/api/*` a `http://localhost:8080`.

---

## Roles y acceso (RBAC)

El sistema tiene 7 roles con rutas y permisos diferenciados. Cada usuario solo ve y opera lo que corresponde a su rol.

| Rol | Ruta por defecto | Qué puede hacer |
|-----|-----------------|-----------------|
| `owner` | `/dashboard` | Control total: órdenes, inventario, envíos, usuarios, reportes |
| `ops` | `/orders` | Crea y gestiona pedidos, coordina despacho |
| `warehouse` | `/inventory` | Controla stock, confirma disponibilidad |
| `shipper` | `/deliveries` | Gestiona sus entregas asignadas, confirma con código + RUT |
| `vendor` | `/pos` | Registra ventas en caja, consulta stock |
| `support` | `/alerts` | Monitorea operación, revisa trazabilidad |
| `customer` | `/tracking` | Consulta su pedido con código `SL-XXXXXX` |

### Usuarios de prueba

Sembrados automáticamente en el primer arranque (`seedUsers()` en `Backend/orders-service/src/index.js`), con contraseña real verificada vía `bcrypt`:

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `admin` | `Admin123!` | owner |
| `operaciones` | `Ops123!` | ops |
| `bodega` | `Bodega123!` | warehouse |
| `transportista` | `Trans123!` | shipper |
| `vendedor1` | `Vend123!` | vendor |
| `vendedor2` | `Vend123!` | vendor |
| `soporte` | `Sop123!` | support |
| `cliente` | `Cli123!` | customer |

---

## Endpoints API (vía BFF :8080)

Salvo login, tracking público, `/api/orders/test` y `validate-rut`, todos los endpoints requieren `Authorization: Bearer <token>`.

### Auth (JWT propio, manejado por orders-service)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | `{username, password}` → JWT firmado con `JWT_SECRET` |
| POST | `/api/auth/register` | Crear usuario (solo owner/admin) |
| GET/PUT/DELETE | `/api/auth/users[/:id]` | Gestión de usuarios (solo owner/admin) |

### Orders

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/orders/test` | Health check |
| GET | `/api/orders/track/:clientCode` | Tracking público por código `SL-XXXXXX` |
| GET | `/api/orders` | Listar órdenes (strip `client_code` para shipper/customer/vendor) |
| GET | `/api/orders/:id` | Detalle de orden |
| GET | `/api/orders/report` | Reporte con datos de cliente (stored procedure) |
| POST | `/api/orders` | Crear orden `{customerId, sku, quantity}` → genera `SL-XXXXXX` |
| PUT | `/api/orders/:id/confirm` | Confirmar (Saga: stock + envío + notificación) |
| PUT | `/api/orders/:id/cancel` | Cancelar `{reason}` (restaura stock si EN_PREPARACION) |
| PUT | `/api/orders/:id/status?status=X` | Cambiar estado |
| PUT | `/api/orders/:id/assign?transporter=X` | Asignar transportista |
| DELETE | `/api/orders/:id` | Eliminar orden |

### Customers (mismo servicio que orders)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/customers` | Listar clientes |
| GET | `/api/customers/:id` | Detalle de cliente |
| POST | `/api/customers` | Crear cliente `{name, phone, address, email, rut}` |
| PUT | `/api/customers/:id` | Actualizar cliente (incluyendo RUT) |
| DELETE | `/api/customers/:id` | Eliminar cliente |
| GET | `/api/customers/validate-rut?rut=X` | Validar RUT chileno (sin auth) |
| GET | `/api/customers/address-suggest?q=X` | Autocompletar dirección (Nominatim) |

### Inventory

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/inventory` | Listar productos |
| GET | `/api/inventory/report` | Reporte clasificado por nivel de stock (SP) |
| GET | `/api/inventory/:sku` | Consultar SKU |
| POST | `/api/inventory` | Agregar producto `{sku, name, stock, price, cost, category, imageUrl}` |
| PUT | `/api/inventory/:sku` | Actualizar stock `{stock}` |
| DELETE | `/api/inventory/:sku` | Eliminar producto |
| POST | `/api/inventory/:sku/adjust?delta=N` | Ajustar stock (SP) |
| PUT | `/api/inventory/:sku/image` | Asignar imagen `{imageUrl}` |
| GET | `/api/inventory/report/pdf` | Reporte de inventario en PDF |
| GET | `/api/inventory/:sku/qr` | Código QR del producto (PNG) |
| GET | `/api/inventory/geocode?address=X` | Geocodificar dirección (Nominatim) |
| GET | `/api/inventory/indicadores` | UF/dólar/UTM del día (mindicador.cl, caché 1h) |
| GET | `/api/inventory/image-search?q=X` | Buscar imágenes de producto (Openverse) |
| GET | `/api/sales` | Listar ventas |
| POST | `/api/sales` | Registrar venta `{sku, quantity}` |

### Shipping

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/shipments` | Listar envíos |
| GET | `/api/shipments/:orderId` | Envío por ID de orden |
| POST | `/api/shipments` | Crear envío + número TRACK-XXXXXXXX |
| PUT | `/api/shipments/:id/stage?stage=X` | Cambiar etapa |
| GET | `/api/shipments/:id/qr` | Código QR del envío (base64) |
| GET | `/api/shipments/:id/qr-image` | Código QR del envío (PNG binario) |
| GET | `/api/shipments/:id/weather` | Clima en destino + riesgo de entrega (Open-Meteo) |
| GET | `/api/shipments/:id/route` | Distancia/duración/ruta al destino (OSRM) |

Al marcar `ENTREGADO`, se valida:
- `customerCode` debe coincidir con `orders.client_code`
- `recipientRut` debe coincidir con `customers.rut`

### Notifications

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/notifications` | Persistir evento (idempotente: 409 DUPLICATE si se repite) |
| GET | `/api/notifications/order/:id` | Trazabilidad de orden |
| GET | `/api/notifications/audience/:aud` | Por audiencia |
| POST | `/api/notifications/alert` | Alerta de stock manual (dispara push) |
| GET | `/api/notifications/weather-alert?lat=&lon=` | Alerta climática (Open-Meteo), registra evento si es adversa |
| GET | `/api/notifications/report/pdf` | Historial de notificaciones en PDF |
| GET | `/api/notifications/qr?text=X` | Código QR genérico (PNG) |
| GET | `/api/notifications/push/vapid-public-key` | Clave pública VAPID (Web Push) |
| POST/DELETE | `/api/notifications/push/subscribe` | Alta/baja de suscripción push del navegador |
| DELETE | `/api/notifications` | Limpiar historial |

### Integraciones externas

| Servicio | Uso |
|----------|-----|
| [Nominatim (OpenStreetMap)](https://nominatim.org/) | Geocodificación de direcciones |
| [Open-Meteo](https://open-meteo.com/) | Clima actual para alertas y riesgo de entrega |
| [OSRM](http://project-osrm.org/) | Cálculo de rutas y distancias |
| [QR Server](https://goqr.me/api/) | Generación de códigos QR |
| [mindicador.cl](https://mindicador.cl/) | Indicadores económicos UF/dólar/UTM |
| [Openverse](https://openverse.org/) | Búsqueda de imágenes de producto (licencia abierta) |
| [web-push (VAPID)](https://github.com/web-push-libs/web-push) | Notificaciones push del navegador |
| [pdfkit](https://pdfkit.org/) | Generación local de reportes PDF |

Ver [wiki/API-Reference.md](wiki/API-Reference.md) para el detalle completo de cada endpoint.

---

## Flujo de negocio completo

```bash
# 0. Login → obtener el token JWT (requerido por casi todos los endpoints)
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"

# 1. Crear cliente con RUT
curl -X POST http://localhost:8080/api/customers \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Juan Perez","phone":"+56912345678","email":"juan@mail.cl","rut":"12.345.678-9"}'

# 2. Agregar producto al inventario
curl -X POST http://localhost:8080/api/inventory \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"sku":"COCA-2L","stock":100}'

# 3. Crear orden → respuesta incluye customerCode (SL-XXXXXX)
curl -X POST http://localhost:8080/api/orders \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"customerId":1,"sku":"COCA-2L","quantity":3}'
# → {"customerCode": "SL-AB12CD", ...}

# 4. Confirmar orden (descuenta stock + crea envío TRACK-XXXXXXXX)
curl -X PUT -H "$AUTH" http://localhost:8080/api/orders/1/confirm

# 5. Asignar transportista
curl -X PUT -H "$AUTH" "http://localhost:8080/api/orders/1/assign?transporter=transportista"

# 6. Avanzar etapas del envío
curl -X PUT -H "$AUTH" "http://localhost:8080/api/shipments/1/stage?stage=EN_REPARTO"

# 7. Confirmar entrega (valida código + RUT)
curl -X PUT "http://localhost:8080/api/shipments/1/stage?stage=ENTREGADO" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"customerCode":"SL-AB12CD","recipientRut":"12.345.678-9","proofOfDeliveryImage":"data:image/..."}'

# 8. El cliente consulta su pedido (endpoint público, sin auth)
curl http://localhost:8080/api/orders/track/SL-AB12CD

# 9. Ver trazabilidad completa
curl -H "$AUTH" http://localhost:8080/api/notifications/order/1
```

---

## Seguridad y RLS

- **JWT role-based:** cada microservicio extrae el rol del claim `role` del JWT (emitido localmente por `POST /api/auth/login`, firmado con `JWT_SECRET`) en cada request.
- **Column-level stripping:** `client_code` se elimina del response para los roles `shipper`, `customer` y `vendor`.
- **Tracking público:** El endpoint `/api/orders/track/:clientCode` devuelve solo campos seguros (sin email ni teléfono del cliente).
- **Validación de entrega:** El shipping-service cruza el código del cliente y el RUT del receptor contra la BD antes de marcar como ENTREGADO.
- **Scope de vistas:** Cada página filtra por rol en frontend (defensa en profundidad).

---

## Comandos Docker útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Logs de un servicio específico
docker compose logs -f orders-service

# Detener todos los contenedores
docker compose down

# Detener y eliminar volumen (borra datos BD)
docker compose down -v

# Reconstruir un servicio específico
docker compose up -d --build orders-service
```

---

## Pruebas

**212 pruebas** en total (backend 159 con Jest + Supertest, frontend 53 con Vitest + RTL). Ver detalle y cobertura en [wiki/Pruebas.md](wiki/Pruebas.md).

```bash
# Backend — npm test ya incluye cobertura (jest --coverage)
cd Backend/orders-service && npm test        # 60 pruebas
cd Backend/inventory-service && npm test     # 45 pruebas
cd Backend/shipping-service && npm test      # 28 pruebas
cd Backend/notification-service && npm test  # 26 pruebas

# Frontend
cd Frontend && npm test                      # 53 pruebas
npm run test:coverage   # Reporte en Frontend/coverage/index.html
```

---

## Estructura del proyecto

```
SmartLogix/
├── Frontend/                   # React 18 SPA + PWA (Vite 6) + Web Push
│   └── src/
│       ├── app/                # Auth, router, RBAC (access.ts)
│       ├── hooks/              # useApiQuery, useCustomerScope, usePermissions...
│       ├── pages/              # 20+ páginas por rol
│       ├── sw.ts               # Service worker propio (precache + push)
│       └── types/              # api.ts, domain.ts
├── Backend/
│   ├── orders-service/         # Node.js :8081 — pedidos + clientes + auth JWT + RLS
│   ├── inventory-service/      # Node.js :8082 — stock + ventas + indicadores + imágenes
│   ├── shipping-service/       # Node.js :8084 — envíos + tracking + entrega + clima/rutas
│   ├── notification-service/   # Node.js :8085 — trazabilidad + alertas + Web Push
│   ├── nginx/                  # Config API Gateway :8080
│   ├── shared/                 # app, db, logger, validate, security, email
│   └── seed.sql                # Datos de prueba
├── Landing/                    # Landing pública (Next.js, deploy en Vercel)
├── infra/                      # Terraform: VPC, ECS, S3, IAM, SSM (AWS)
├── .github/workflows/          # CI/CD: infra-deploy, app-deploy, frontend-deploy
├── wiki/                       # Documentación técnica del proyecto
├── ENTREGABLE/                 # Colección Postman + reporte Newman
└── docker-compose.yml          # Orquestación completa local
```
