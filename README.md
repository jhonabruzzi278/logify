# Logify — Plataforma de Gestión Logística

Logify es una plataforma SaaS de gestión logística y comercial: pedidos B2B,
inventario, envíos y notificaciones, más un punto de venta B2C completo
(POS con fiado, caja, compras a proveedor y reportes de ganancia real) en
un solo sistema, con control de acceso por rol.

**Repositorio:** https://github.com/jhonabruzzi278/logify
**En producción:** [logify.cl](https://logify.cl) (landing) · [app.logify.cl](https://app.logify.cl) (portal central de acceso) · `<empresa>.logify.cl` (dashboard del tenant) · [api.logify.cl](https://api.logify.cl) (backend) · [status.logify.cl](https://status.logify.cl) (monitoreo)

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
| logify-db | 5432 | PostgreSQL (4 DBs) |
| logify-orders | 8081 | orders-service |
| logify-inventory | 8082 | inventory-service |
| logify-shipping | 8084 | shipping-service |
| logify-notification | 8085 | notification-service |
| logify-api-gateway | **8080** | Nginx BFF (punto único de entrada) |

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

## Modo B2B / B2C y funcionalidades comerciales

Logify opera en dos modos que se alternan con un switch en el topbar
(persistido en `localStorage`, no cambia nada en el backend — solo filtra
qué páginas se muestran en la navegación):

- **B2B** (modo original): Pedidos, Envíos, Entregas.
- **B2C**: Punto de Venta (POS).

Dashboard, Inventario, Clientes, Compras, Reportes, Proveedores, Usuarios y
Configuración son comunes a ambos modos.

**Clientes B2B vs. B2C** — cada cliente tiene un `customerType`
(`company`/`individual`); el RUT solo es obligatorio en el formulario para
clientes tipo empresa.

**Cuenta corriente (fiado)** — cada cliente puede tener un `creditLimit`
opcional y un `creditBalance` que se ajusta atómicamente (con locking a
nivel de fila, mismo patrón que el ajuste de stock) vía cargos y abonos,
con historial completo de movimientos.

**POS (Punto de Venta)** — además de la venta simple:
- Métodos de pago: efectivo, transferencia, débito y **fiado** (exige
  cliente registrado, carga automáticamente su cuenta corriente).
- Escáner de código de barras (cámara), buscador con "Enter para agregar".
- "Consultar Precio" (sin tocar el carrito) y "Agregar Monto" (línea libre
  sin SKU real, para cobros varios).
- "Gestionar Extras": descuento o recargo (%, o monto fijo) sobre la venta.
- Doble Enter para cobrar.
- **Sesiones de caja**: apertura con monto inicial, cierre con conteo real
  y diferencia calculada contra las ventas en efectivo del turno.

**Compras a proveedor** — registra una compra (producto, proveedor, costo
unitario, cantidad) que sube el stock automáticamente y, opcionalmente,
actualiza el costo del producto (`updatePrices`). Historial completo en
`/purchases`.

**Reportes → Ganancia real** — cada venta guarda el costo del producto al
momento exacto de la transacción (no el costo actual), lo que permite
calcular ganancia real por venta, top productos por ganancia y el gráfico
de ingresos/ganancia por día. Ventas anteriores a esta funcionalidad no
tienen costo guardado y se excluyen del cálculo (no se cuentan como $0).

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
| POST | `/api/customers` | Crear cliente `{name, phone, address, email, rut, customerType, creditLimit}` |
| PUT | `/api/customers/:id` | Actualizar cliente (incluyendo RUT, customerType, creditLimit) |
| DELETE | `/api/customers/:id` | Eliminar cliente |
| GET | `/api/customers/validate-rut?rut=X` | Validar RUT chileno (sin auth) |
| GET | `/api/customers/address-suggest?q=X` | Autocompletar dirección (Nominatim) |
| GET | `/api/customers/:id/credit` | Saldo y movimientos de cuenta corriente |
| POST | `/api/customers/:id/credit/charge` | Cargar fiado `{amount, note?}` |
| POST | `/api/customers/:id/credit/payment` | Registrar abono `{amount}` |

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
| GET | `/api/sales` | Listar ventas (agrupadas por ticket, incluye `unitCost` por item) |
| POST | `/api/sales` | Registrar venta `{items[], paymentMethod, customerId?}` — items con `isManualAmount:true` (Agregar Monto/Descuento/Recargo) no requieren SKU real |
| GET | `/api/sales/close-summary?date=` | Desglose de ventas del día por método de pago |
| GET | `/api/purchases?q=` | Historial de compras a proveedor |
| POST | `/api/purchases` | Registrar compra `{sku, supplierId, unitCost, quantity, updatePrices}` — sube stock y, si corresponde, actualiza el costo |
| GET | `/api/cash-sessions/active` | Sesión de caja abierta del vendedor actual |
| GET | `/api/cash-sessions` | Historial de sesiones de caja |
| POST | `/api/cash-sessions` | Abrir caja `{openingAmount}` |
| PUT | `/api/cash-sessions/:id/close` | Cerrar caja `{countedAmount}` → calcula diferencia |

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

## Despliegue a producción

- **Backend en VPS propio** (Docker Compose + Caddy con TLS automático).
  Guía completa en [wiki/Despliegue-VPS.md](wiki/Despliegue-VPS.md), incluye
  `docker-compose.prod.yml`, backups de Postgres y hardening básico
  (firewall, sin puertos internos expuestos).
- **Frontend y Landing en Vercel**, cada uno su propio proyecto conectado
  al repo (`Root Directory` distinto). Guía en
  [wiki/Despliegue-Vercel.md](wiki/Despliegue-Vercel.md).
- **Monitoreo:** página pública de status en `status.logify.cl` (Uptime
  Kuma, self-hosted en el mismo VPS). Ver [wiki/Monitoreo.md](wiki/Monitoreo.md).

## Contribuir

`main` está protegida: todo cambio entra vía Pull Request, y el PR no se
puede mergear hasta que los 6 checks de CI (`.github/workflows/ci.yml`)
estén en verde — aplica también a administradores del repo. Detalle
completo del flujo en [wiki/Flujo-Git.md](wiki/Flujo-Git.md).

El título del PR debe seguir [Conventional Commits](https://www.conventionalcommits.org/es/)
(`feat: ...`, `fix: ...`, etc.) porque el merge es `--squash` y ese mensaje
alimenta el versionado automático — ver [wiki/Versionado.md](wiki/Versionado.md).

## Versionado y licencia

El proyecto usa [Versionado Semántico](https://semver.org/lang/es/)
(`MAJOR.MINOR.PATCH`) con releases automatizadas por
[release-please](https://github.com/googleapis/release-please) a partir de
Conventional Commits. Versión actual e historial en
[CHANGELOG.md](CHANGELOG.md); detalle del flujo en
[wiki/Versionado.md](wiki/Versionado.md).

Software propietario — todos los derechos reservados. Ver
[LICENSE](LICENSE).

## Arquitectura multi-tenant

El sistema opera como SaaS multi-tenant con una empresa por subdominio
(`<empresa>.logify.cl`) y aislamiento por `tenant_id` derivado del JWT.
`app.logify.cl` funciona como portal neutral para encontrar la empresa,
aceptar invitaciones y comenzar recuperaciones; las sesiones privadas siempre
continúan en el subdominio del tenant. Ver [wiki/Multi-Tenant.md](wiki/Multi-Tenant.md).

---

## Pruebas

**558 pruebas unitarias/integración** (backend 435 con Jest + Supertest; frontend 123 con Vitest + RTL) **+ 15 E2E** con Playwright (regresión visual + flujos críticos) **+ pruebas de carga** con k6. Ver detalle completo en [wiki/Pruebas.md](wiki/Pruebas.md).

Todas corren automáticamente en CI (`.github/workflows/ci.yml`) en cada PR — `main` tiene branch protection y no acepta merges si el CI falla (ver [wiki/Flujo-Git.md](wiki/Flujo-Git.md)).

```bash
# Backend — npm test ya incluye cobertura (jest --coverage)
cd Backend/orders-service && npm test        # 187 pruebas — 82.23% cobertura
cd Backend/inventory-service && npm test     # 122 pruebas — 92.84% cobertura
cd Backend/shipping-service && npm test      # 59 pruebas — 93.44% cobertura
cd Backend/notification-service && npm test  # 67 pruebas — 94.11% cobertura

# Frontend
cd Frontend && npm test                      # 123 pruebas unitarias/integración (Vitest)
npm run test:coverage                        # Reporte en Frontend/coverage/index.html
npm run test:e2e                             # 15 pruebas E2E (Playwright) — requiere `npm run dev` corriendo

# Carga (k6) — solo contra docker-compose local o staging, nunca producción
cd Backend/load-tests && k6 run smoke.js     # smoke test rápido
k6 run load.js                               # carga sostenida (~3 min)
```

---

## Estructura del proyecto

```
Logify/
├── Frontend/                   # React 18 SPA + PWA (Vite 6) + Web Push
│   ├── e2e/                    # Playwright: specs, auth.setup por rol, snapshots visuales
│   └── src/
│       ├── app/                # Auth, router, RBAC (access.ts)
│       ├── hooks/               # useApiQuery, useBusinessMode, usePosCart, useCountUp, useStaggerReveal...
│       ├── components/pos/     # Modales del POS: escáner, caja, monto libre, extras
│       ├── pages/              # 20+ páginas por rol (incluye purchases-page, billing-page)
│       ├── sw.ts               # Service worker propio (precache + push)
│       └── types/              # api.ts, domain.ts
├── Backend/
│   ├── orders-service/         # Node.js :8081 — pedidos + clientes + auth JWT + RLS
│   ├── inventory-service/      # Node.js :8082 — stock + ventas + indicadores + imágenes
│   ├── shipping-service/       # Node.js :8084 — envíos + tracking + entrega + clima/rutas
│   ├── notification-service/   # Node.js :8085 — trazabilidad + alertas + Web Push
│   ├── nginx/                  # Config API Gateway :8080
│   ├── shared/                 # app, db, logger, validate, security, email
│   ├── load-tests/             # Pruebas de carga con k6 (smoke.js, load.js)
│   ├── postgres/backup.sh      # Backup diario (cron) para despliegue en VPS
│   ├── Caddyfile                # Proxy TLS automático para despliegue en VPS
│   └── seed.sql                # Datos de prueba
├── Landing/                    # Landing pública (Next.js, deploy en Vercel)
├── wiki/                       # Documentación técnica del proyecto (incluye Despliegue-VPS.md)
├── docs/
│   ├── technical/               # Arquitectura, persistencia, informe de pruebas (HTML)
│   └── api/                     # Colección Postman
├── docker-compose.yml          # Orquestación completa local
└── docker-compose.prod.yml     # Orquestación para VPS (sin puertos internos expuestos, con Caddy/TLS)
```

---

## 📋 Documentación del Proyecto (AI-DLC)

Este proyecto sigue la metodología AI-DLC. Estado actual: **Operations — producción activa y estabilización continua**.

Documentación completa en [`/aidlc-docs/`](./aidlc-docs/):
- [Requirements e Intent](./aidlc-docs/requirements/)
- [Historias de usuario](./aidlc-docs/story-artifacts/)
- [Architecture y Domain Model](./aidlc-docs/design-artifacts/ARCHITECTURE.md)
- [Decisiones de arquitectura (ADRs)](./aidlc-docs/design-artifacts/ADR/)
- [Testing Strategy y Coverage real medido](./aidlc-docs/testing/TEST_COVERAGE_REPORT.md)
- [Deployment Checklist](./aidlc-docs/deployment/DEPLOYMENT_CHECKLIST.md)
- [Operations](./aidlc-docs/operations/) *(producción activa: VPS + Vercel, Uptime Kuma, CI/CD y post-mortems)*

Última auditoría: 2026-08-25. Se cerraron los bloqueantes de registro público,
CORS, backups y acceso SSH; producción quedó validada en el commit `c1fdd05`.
Quedan como tareas de mantenimiento la copia externa de backups, la rotación de
la contraseña root expuesta y un reinicio programado. Ver
[`aidlc-docs/operations/PRODUCTION_AUDIT_2026-08-25.md`](./aidlc-docs/operations/PRODUCTION_AUDIT_2026-08-25.md).
