# Arquitectura Multi-Tenant

Logify opera como SaaS multi-tenant. Toda cuenta se crea mediante el onboarding
público de `logify.cl/registro` y la única entrada a la aplicación es
`app.logify.cl/login`. Los clientes no tienen subdominios propios.

## Topología

Frontend central en `app.logify.cl` (Vercel) y **un solo backend fijo** en
`api.logify.cl` (VPS detrás de Caddy). El tenant se deriva de los claims de la
Organization activa en el JWT de Clerk, no del hostname ni de datos pedidos al
usuario. Esto mantiene una API central y evita enumerar empresas.

### Portal central de acceso

`app.logify.cl` es el portal central. El usuario inicia sesión con correo o
username y la Organization activa del JWT determina el tenant, sin solicitar
un slug ni exponer una búsqueda pública de empresas.

Antes de crear la cuenta, el propietario completa el onboarding público: datos
de contacto, negocio, experiencia, objetivos y contraseña. `POST /api/signup`
crea tenant, usuario, Organization y membership en Clerk, y marca
`tenants.onboarding_completed_at`. Por eso el primer login abre directamente la
aplicación; `/onboarding` queda como salvaguarda para altas administrativas
incompletas.

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
  slug           VARCHAR(63) UNIQUE NOT NULL   -- identificador interno, ej. "acme"
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
- **4D — Dominios de producción** ✅ `app.logify.cl` en Vercel y
  `api.logify.cl` en el VPS, con `ALLOWED_ORIGINS`/`APP_URL` configurados.
- **4E — Provisioning de tenants** ✅ Signup self-service público
  (`POST /api/signup` + `GET /api/signup/check-slug` en orders-service,
  formulario en `Landing/pages/registro.js`): crea el tenant, su usuario
  `owner`, la Organization de Clerk y su membership; finaliza en el login
  central, sin depender de subdominios. El alta incluye una demo
  gratuita de 30 días (`tenants.trial_ends_at`) extensible vía un sistema de
  cupones (tablas `coupons`/`coupon_redemptions`, administradas por
  `POST/GET /api/admin/coupons` protegidos con el header `X-Admin-Key`).
  `tenants` también quedó preparada para cobro real (`subscription_status`,
  `plan_price_clp`, `billing_provider`, `billing_customer_id`, todas
  nullable/sin uso todavía — un único plan mensual, sin niveles) — ningún
  proveedor de pago está integrado aún. Pendiente: panel de super-admin con
  UI (hoy los cupones se gestionan por API con secreto compartido) y
  activar un proveedor de cobro cuando corresponda.
- **Recuperación y eliminación de tenants** (mismo secreto `X-Admin-Key`,
  ver `Backend/shared/admin.js`): `POST /api/admin/tenants/:slug/reset-owner`
  crea o resetea un usuario `owner` para un tenant bloqueado (ver postmortem
  `2026-08-07-admin-autoeliminacion.md`); `DELETE /api/admin/tenants/:slug`
  elimina el tenant y todos sus datos de forma irreversible en los 4
  servicios (runbook completo en
  `aidlc-docs/operations/INCIDENT_RUNBOOKS.md`).

Ver [README.md](../README.md#roadmap-multi-tenant) para el estado general
del roadmap.
