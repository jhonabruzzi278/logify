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
