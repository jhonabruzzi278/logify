# Billing Service

API central de facturacion de Logify. Esta primera fase contiene el dominio,
persistencia multi-tenant, idempotencia, auditoria append-only, outbox, metricas
y un proveedor falso exclusivo para sandbox. No contiene credenciales ni
adaptadores de proveedores reales.

## Endpoints iniciales

- `POST /api/billing/v1/subscriptions`
- `GET /api/billing/v1/subscriptions/:id`
- `POST /api/billing/v1/subscriptions/:id/cancel`
- `GET /api/billing/v1/admin/providers` (administrador de plataforma)
- `GET /metrics` (Bearer interno)
- `GET /health`

Las mutaciones exigen `Idempotency-Key`. Las rutas de tenant exigen JWT/Clerk,
tenant verificado y una conexion PostgreSQL restringida con RLS.

## Sandbox local

Variables obligatorias:

```text
DB_URL=postgresql://postgres:...@postgres-db:5432/billing_db
DB_RUNTIME_URL=postgresql://app_runtime:...@postgres-db:5432/billing_db
DB_RUNTIME_PASSWORD=...
JWT_SECRET=...
BILLING_ENVIRONMENT=sandbox
BILLING_DEFAULT_PROVIDER=fake
BILLING_FAKE_PROVIDER_ENABLED=true
BILLING_METRICS_TOKEN=...
```

El proceso se niega a iniciar si falta `DB_RUNTIME_URL` o el rol restringido.
El proveedor `fake` se rechaza expresamente cuando `BILLING_ENVIRONMENT=production`.

## Sandbox remoto

El workflow `Deploy Billing Sandbox` solo acepta el PR de la rama
`feat/billing-core-sandbox` y exige la etiqueta `deploy-sandbox`. Usa el
Environment de GitHub `sandbox`, un checkout separado en el VPS y el proyecto
Docker `logify-billing-sandbox`; no modifica el checkout ni el compose de
produccion.

El gateway queda ligado exclusivamente a `127.0.0.1:8087` y se conecta a Caddy
por una red Docker dedicada; ni billing-service ni PostgreSQL se conectan a esa
red. Antes de recargar Caddy, el deploy valida su configuracion y la salud de
produccion. Si la publicacion o las comprobaciones posteriores fallan, restaura
la configuracion montada de produccion. El deploy tambien prueba salud con
PostgreSQL, creacion y replay idempotente, y aislamiento entre tenants mediante
RLS. Las metricas no se publican a traves del gateway.
