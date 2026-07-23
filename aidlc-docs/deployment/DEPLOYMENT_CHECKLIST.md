# Deployment Checklist

Este checklist combina el checklist real ya existente en `RENDER_DEPLOY.md` (escrito por el propio equipo, y **sin marcar** al momento de esta auditoría) con verificaciones adicionales hechas durante esta auditoría.

## Pre-Deployment

- [x] Tests pasando localmente — **verificado en esta auditoría (2026-07-19): 226/226 tests pasan** en los 4 servicios backend + frontend (ver `testing/TEST_COVERAGE_REPORT.md`)
- [ ] CI/CD configurado — **NO existe.** Removido deliberadamente (commit `6018f89`). El despliegue depende 100% del autodeploy nativo de Render/Vercel al hacer push a `main`, sin gate de tests. Ver `design-artifacts/ADR/ADR-003-...md`.
- [x] Secrets no commiteados — verificado: `.env.example` (raíz, Backend, Frontend) contienen solo placeholders (`ep-xxxx.neon.tech`, `__generar_valor_random_fuerte__`), no credenciales reales. `.gitignore` presente en Backend, Frontend, Landing.
- [ ] Cobertura de tests sobre el umbral declarado (60% backend) — **NO se cumple**, medido real 28.41%-51.44% en los 4 servicios backend (ver `testing/TEST_COVERAGE_REPORT.md`)
- [ ] Checklist de "producción" de `RENDER_DEPLOY.md` marcado — **sin marcar** al momento de esta auditoría (contiene: `JWT_SECRET` fuerte y no default, `ALLOWED_ORIGINS` real (no `*`), health checks pasando, URLs inter-servicio reales (sin placeholders `REEMPLAZAR-...`), SSL válido en los 3 dominios, SMTP configurado o modo demo aceptado, VAPID keys generadas si se usa Web Push, sin `.env` commiteados, test end-to-end de login incluyendo cold-start)

## Infraestructura Detectada

| Artefacto | Presente | Notas |
|---|---|---|
| `Dockerfile` por servicio | ✅ (4 servicios backend + nginx + postgres) | Single-stage, Alpine, usuario no-root, `HEALTHCHECK` — ver Dockerfile de referencia en `design-artifacts/ARCHITECTURE.md` |
| `docker-compose.yml` | ✅ | Orquestación local completa: 6 contenedores, healthchecks, `depends_on: condition: service_healthy` |
| `render.yaml` (Render Blueprint) | ✅ | 5 servicios web Docker, plan free, región Oregon, `healthCheckPath` configurado por servicio. Varias URLs inter-servicio son placeholders literales (`https://REEMPLAZAR-orders-service.onrender.com`) que requieren reemplazo manual post-deploy |
| Terraform / IaC declarativo de nube | ❌ (removido) | Existió previamente, retirado junto con AWS y CI/CD (commit `6018f89`) |
| `vercel.json` (Frontend) | ✅ (mínimo: `{"rewrites": []}`) | Deploy a Vercel |
| `.vercel/` (Landing) | ✅ | Confirma proyecto Vercel ya vinculado |
| Runbook de despliegue | ✅ | `RENDER_DEPLOY.md` — guía detallada de 7 partes (A-G), estilo conversacional/en progreso, no un documento formal terminado |
| DNS / dominio custom | Parcial | `logify.cl` planeado (DonDominio), wildcard `*.logify.cl` pendiente (requiere posiblemente Vercel Pro ~US$20/mes para SSL wildcard) |

## Health Checks Confirmados

- Cada microservicio expone `/health` (verifica conectividad a BD vía `SELECT 1`) — implementado en `Backend/shared/app.js`.
- Nginx expone `/healthz`.
- Usados activamente por: `HEALTHCHECK` de cada Dockerfile, `depends_on: condition: service_healthy` en `docker-compose.yml`, y `healthCheckPath` en `render.yaml`.

## Gaps de cara a un despliegue de producción real (no solo demo)

1. Sin CI que valide tests/build antes de desplegar (ver arriba).
2. Sin logging estructurado ni monitoring (ver `operations/MONITORING_SETUP.md`).
3. Free tier de Render: servicios backend duermen tras 15 min de inactividad → cold starts de 30-60s en cascada para un flujo Saga que llama a 3 servicios secuencialmente.
4. Sin red privada real entre servicios en Render free tier — todo el tráfico inter-servicio viaja por HTTPS público (mitigado por JWT+CORS, pero es una superficie de ataque mayor que una red privada).
5. Wiring manual de URLs inter-servicio en `render.yaml` (proceso de "dos pasadas": deploy inicial con placeholders, luego reemplazo manual) — propenso a error humano.
6. Sin plan de rollback/versión anterior documentado más allá de lo que Render/Vercel ofrecen nativamente por defecto.
