# Arquitectura Multi-Tenant

Logify está migrando de single-tenant (una sola empresa operadora) a SaaS
multi-tenant, con una empresa cliente por subdominio (`<empresa>.logify.cl`).
La migración se hace en fases incrementales; cada una se puede desplegar sin
romper el sistema actual.

## Topología

Frontend en `*.logify.cl` (wildcard, Vercel), pero **un solo backend fijo**
en `api.logify.cl` (Render, sin wildcard). El frontend deriva el tenant de
`window.location.hostname` y lo manda como header `X-Tenant-Slug` en cada
request. Esto evita depender de que Render soporte dominios wildcard y
evita problemas de CORS.

**Regla de seguridad dura:** el header `X-Tenant-Slug` nunca se usa para
filtrar SQL directamente — solo `req.user.tenant_id`, ya verificado desde el
JWT, se usa para scoping de datos. El header solo sirve para (a) resolver el
tenant en login, antes de tener JWT, y (b) detectar reuso cruzado de token.

## Modelo de datos

Tabla maestra `tenants` en `orders_db` (ya es el servicio dueño de `users`).
No hay FK física entre bases — Postgres no permite FK cross-database en el
patrón database-per-service que ya usa Logify — así que el id del tenant es
una referencia lógica, no forzada por constraint.

```sql
tenants
  id             SERIAL PRIMARY KEY
  slug           VARCHAR(63) UNIQUE NOT NULL   -- subdominio, ej. "acme"
  name           VARCHAR(200) NOT NULL
  status         VARCHAR(20) NOT NULL DEFAULT 'trial'  -- trial|active|suspended|cancelled
  plan           VARCHAR(50) NOT NULL DEFAULT 'trial'
  contact_email  VARCHAR(200)
  settings       JSONB DEFAULT '{}'
  created_at     TIMESTAMP DEFAULT NOW()
  updated_at     TIMESTAMP DEFAULT NOW()
```

Columna `tenant_id` agregada en:

| Base | Tablas |
|------|--------|
| `orders_db` | `users`, `customers`, `orders` |
| `inventory_db` | `inventory`, `sales`, `processed_events` |
| `shipping_db` | `shipments`, `processed_events` |
| `notification_db` | `notification_records`, `push_subscriptions` |

El tenant `id=1, slug='logify'` es el tenant por defecto: agrupa todos los
datos existentes antes de la migración. Es el mismo id fijo usado en las
migraciones de las 4 bases (acoplamiento aceptado del patrón
database-per-service, ya que no hay forma de generarlo automáticamente de
forma consistente entre bases separadas).

## Fases

- **4A — Fundación de esquema** ✅ Tabla `tenants` + columna `tenant_id`
  (nullable → backfill a 1 → NOT NULL → índice) en las 4 bases. Sin cambiar
  comportamiento de la app: nada lee ni filtra por `tenant_id` todavía.
- **4B — Middleware de resolución de tenant** ✅ `Backend/shared/tenant.js`
  con `extractTenantSlug`, reenvío de `X-Tenant-Slug` entre servicios vía
  `forwardedFetch`, frontend mandando el header derivado del subdominio.
- **4C — JWT con tenant + enforcement** ✅ `signToken` incluye
  `tenant_id`/`tenant_slug`, nueva `requireTenant` en `Backend/shared/auth.js`
  montada en las ~50 rutas protegidas de los 4 servicios. Todas las queries y
  los 4 stored procedures filtran por `tenant_id`. Constraints únicos pasan a
  compuestos por tenant (`users.username`, `users.rut`, `inventory.sku`,
  `notification_records` event+audience, PK de `processed_events`). Corregido
  el bug de `broadcastPush` en notification-service (mandaba push a todas las
  suscripciones sin filtrar por tenant). Verificado con un tenant de prueba
  real (`acme`): aislamiento de datos confirmado y reuso cruzado de token
  entre tenants rechazado con 403.
- **4D — Wildcard DNS + dominio propio** (pendiente) `*.logify.cl` en Vercel,
  `api.logify.cl` en Render, actualizar `ALLOWED_ORIGINS`/`APP_URL`.
- **4E — Provisioning de tenants** ✅ Signup self-service público
  (`POST /api/signup` + `GET /api/signup/check-slug` en orders-service,
  formulario en `Landing/pages/registro.js`): crea el tenant y su usuario
  "owner" en una transacción, sin verificación de email, con una demo
  gratuita de 90 días (`tenants.trial_ends_at`) extensible vía un sistema de
  cupones (tablas `coupons`/`coupon_redemptions`, administradas por
  `POST/GET /api/admin/coupons` protegidos con el header `X-Admin-Key`).
  `tenants` también quedó preparada para cobro real (`subscription_status`,
  `plan_price_clp`, `billing_provider`, `billing_customer_id`, todas
  nullable/sin uso todavía — un único plan mensual, sin niveles) — ningún
  proveedor de pago está integrado aún. Pendiente: panel de super-admin con
  UI (hoy los cupones se gestionan por API con secreto compartido) y
  activar un proveedor de cobro cuando corresponda.

Ver [README.md](../README.md#roadmap-multi-tenant) para el estado general
del roadmap.
