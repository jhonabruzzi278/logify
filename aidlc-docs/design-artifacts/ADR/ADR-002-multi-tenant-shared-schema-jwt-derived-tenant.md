# ADR-002: Multi-tenancy con esquema compartido y tenant derivado exclusivamente del JWT

**Status:** Aceptado (fases 4A-4E implementadas)
**Fecha inferida:** trabajo reciente — el último commit del repo ("fix: soportar subdominios de tenant en CORS + guia completa de deploy", 2026-07-16) es parte de esta iniciativa.

## Contexto

Logify nació como sistema single-tenant y evolucionó a SaaS multi-tenant (una empresa por subdominio, `<empresa>.logify.cl`) sin interrumpir el sistema existente ni requerir una reescritura. El frontend wildcard vive en Vercel y utiliza una API central en el VPS.

## Decisión

1. **Esquema compartido, no base de datos por tenant:** se añadió una columna `tenant_id` a todas las tablas de las 4 bases de datos existentes, con backfill al tenant por defecto (`id=1, slug='logify'`) para no romper datos pre-existentes.
2. **El tenant se resuelve y confía EXCLUSIVAMENTE desde el JWT verificado (`req.user.tenant_id`), nunca desde el header `X-Tenant-Slug`** — el header solo se usa para (a) resolver el tenant antes de que exista un JWT (ej. en login) y (b) detectar reuso cross-tenant de tokens comparando contra el tenant esperado.
3. Middleware `requireTenant` (en `shared/auth.js`) se monta explícitamente en ~50 rutas protegidas across los 4 servicios.
4. Todos los índices únicos se volvieron compuestos con `tenant_id` (ej. `username` único por tenant, no globalmente).

## Consecuencias

**Positivas:**
- Migración incremental y no disruptiva — cada fase (4A schema, 4B propagación de header, 4C enforcement) fue reversible/verificable independientemente sin downtime.
- Seguridad: al no confiar en un header controlable por el cliente para el filtrado de datos, se elimina una clase entera de ataques de spoofing de tenant vía header manipulado.
- Verificado con un tenant de prueba real (`acme`): aislamiento de datos confirmado, reuso cross-tenant de token rechazado con 403.

**Negativas / riesgos:**
- **No usa Row-Level Security nativo de PostgreSQL** (`CREATE POLICY`) pese a que la documentación existente se titula "Seguridad y RLS" — el aislamiento depende de que **cada query nueva** en el código de aplicación recuerde filtrar por `tenant_id`. Un desarrollador que añada un endpoint nuevo y olvide el filtro introduce una fuga de datos cross-tenant silenciosa. Esto es un riesgo real de mantenibilidad a largo plazo — se recomienda evaluar RLS nativo de Postgres como hardening futuro.
- Sin foreign keys físicas de `tenant_id` hacia la tabla `tenants` en las bases `inventory_db`, `shipping_db`, `notification_db` (Database-per-Service impide FKs cross-DB) — la integridad referencial del tenant es lógica, no forzada por el motor de BD.
- Dominio wildcard (`*.logify.cl`) y auto-provisión de tenants (fases 4D/4E) están implementados. El onboarding público crea tenant y owner con prueba de 30 días; el backend central vive en `api.logify.cl` sobre el VPS.

## Alternativas consideradas

⚠️ No documentadas explícitamente en el repo (ej. base de datos separada por tenant, Postgres RLS nativo). Dado el contexto de free-tier y equipo pequeño, esquema compartido con enforcement de aplicación es la opción de menor costo operativo, a cambio de mayor responsabilidad de disciplina en el código.
