# Infrastructure as Code

El proyecto no usa IaC declarativo formal (Terraform/Pulumi/CDK) hoy — fue removido deliberadamente (commit `6018f89`, junto con AWS y CI/CD, ver `design-artifacts/ADR/ADR-003-...md`). La infraestructura actual se define mediante 3 artefactos semi-declarativos específicos de cada plataforma:

## 1. `docker-compose.yml` (local/desarrollo)

Orquesta 6 contenedores:
| Servicio | Imagen/Build | Puerto | Depende de |
|---|---|---|---|
| `logify-db` | `Backend/postgres/Dockerfile` (Postgres 15 Alpine + init) | 5432 | — |
| `logify-orders` | `Backend/orders-service/Dockerfile` | 8081 | `logify-db` (healthy) |
| `logify-inventory` | `Backend/inventory-service/Dockerfile` | 8082 | `logify-db` (healthy) |
| `logify-shipping` | `Backend/shipping-service/Dockerfile` | 8084 | `logify-db` (healthy) |
| `logify-notification` | `Backend/notification-service/Dockerfile` | 8085 | `logify-db` (healthy) |
| `logify-api-gateway` | `Backend/nginx/Dockerfile` | 8080 | los 4 servicios (healthy) |

Nota: contiene una contraseña de desarrollo hardcodeada (`admin123`) — aceptable porque es exclusivamente para el entorno local, no se usa en `render.yaml`.

## 2. `render.yaml` (Render Blueprint — backend de producción)

Declara 5 servicios web Docker (los 4 microservicios + `nginx` como api-gateway), todos en plan free, región `oregon`, cada uno con:
- `healthCheckPath` (`/health` o `/healthz`)
- Variables de entorno explícitas, con secretos marcados `sync: false` (se ingresan manualmente en el dashboard de Render, no se commitean)
- URLs inter-servicio como placeholders literales que requieren reemplazo manual post-primer-deploy (`https://REEMPLAZAR-<servicio>.onrender.com`)

Esto lo hace "IaC parcial": declara la topología de servicios pero **no** es 100% reproducible con un solo comando — requiere un paso manual de "segunda pasada" documentado en `RENDER_DEPLOY.md` Parte B.

## 3. `vercel.json` (Frontend) + proyecto Vercel vinculado (Landing)

- `Frontend/vercel.json` actualmente mínimo (`{"rewrites": []}`) — la configuración real de build/deploy vive en el dashboard de Vercel (root directory `Frontend`, framework autodetectado Vite).
- `Landing/.vercel/` confirma un proyecto Vercel ya vinculado para el sitio Next.js, como proyecto Vercel separado (root directory `Landing`).

## Base de datos: Neon (Postgres serverless)

No hay IaC para el aprovisionamiter de Neon — es un paso manual documentado en `RENDER_DEPLOY.md` Parte A: crear proyecto, ejecutar `Backend/init-db.sql` (crea las 4 bases), `Backend/stored-procedures.sql`, y opcionalmente `Backend/seed.sql`. Free tier: 0.5GB almacenamiento, 100 CU-hora/mes, auto-suspensión tras 5 min de inactividad.

## Resumen de madurez de IaC

| Aspecto | Estado |
|---|---|
| Definición declarativa de servicios | Parcial (`render.yaml` + `docker-compose.yml`), sin Terraform/Pulumi |
| Reproducibilidad de un entorno desde cero con un comando | ❌ — requiere pasos manuales documentados (wiring de URLs, creación de BD en Neon, variables `sync: false`) |
| Versionado de infraestructura junto al código | Parcial — `render.yaml` y `docker-compose.yml` están versionados; el estado real de Render/Vercel/Neon (dashboards) no lo está |
| Gestión de secretos | Manual vía dashboards de cada plataforma — sin secret manager centralizado (ej. no hay integración con Doppler, AWS Secrets Manager, Vault) |

**Recomendación (no una decisión tomada):** dado que el objetivo de costo es $0/mes y el equipo ya retiró Terraform intencionalmente, no se recomienda reintroducir IaC pesado — pero sí formalizar el runbook manual de `RENDER_DEPLOY.md` en un script idempotente (ej. un script que verifique/cree las URLs inter-servicio automáticamente vía API de Render) para reducir el riesgo de error humano en el wiring de "segunda pasada".
