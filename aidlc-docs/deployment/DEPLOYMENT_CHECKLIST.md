# Deployment Checklist

> **Actualizado 2026-08-09** tras revisión de producción, CI/CD, VAPID y caché PWA +
> incidente real de producción (ver
> `operations/POST_MORTEMS/2026-08-06-signup-404-produccion.md`). El
> checklist original (basado en `RENDER_DEPLOY.md`, cuando el backend
> vivía en Render) queda obsoleto desde que el backend se movió a VPS
> propio — ver `wiki/Despliegue-VPS.md`. Se conserva la estructura, no
> el contenido viejo.

## Estado real al 2026-08-09

El sistema **está desplegado y sirviendo tráfico real**: `logify.cl`,
`app.logify.cl`, `api.logify.cl` y `status.logify.cl` responden 200 con
TLS válido (verificado en esta auditoría). Esto ya no es un ejercicio de
"¿está listo para producción?" en abstracto — es un sistema en
producción que tuvo un incidente real hoy mismo (ruta de signup
inalcanzable, resuelto — ver post-mortem).

## Pre-Deployment

- [x] Tests pasando en CI — verificado contra el log real de la corrida
      exitosa del commit `830021f`: `orders-service` 142/142 tests,
      84.99% statements. Consistente con lo declarado en `wiki/Pruebas.md`
      La medición actual del 2026-08-09 registra 558 pruebas: 435 backend y 123 Frontend.
- [x] CI/CD configurado — `.github/workflows/ci.yml` corre tests en los
      4 microservicios + Frontend (typecheck+test+build) + Landing
      (build) en cada PR y push a `main`, con branch protection.
      **Nota:** GitHub Actions tuvo un Major Outage a nivel de
      plataforma el 2026-08-06 (~16:33 UTC en adelante) que dejó 2 runs
      en `queued` indefinidamente — no es un problema de configuración
      del repo, ver post-mortem para cómo se resolvió sin esperar al CI.
- [x] Pipeline DevSecOps — `.github/workflows/security.yml` ejecuta auditoría
      npm, CodeQL, Gitleaks, Trivy y genera SBOM CycloneDX. Dependabot cubre
      los seis proyectos npm y GitHub Actions.
- [x] Secrets no commiteados — `.env` nunca trackeado por git (verificado
      con `git ls-files`), `.gitignore` lo cubre en raíz/Backend/Frontend/Landing.
- [x] `.env` de producción en el VPS tiene todas las variables
      obligatorias definidas (`POSTGRES_PASSWORD`, `DB_RUNTIME_PASSWORD`,
      `JWT_SECRET`, `ALLOWED_ORIGINS`, `API_DOMAIN`, `STATUS_DOMAIN`,
      `ACME_EMAIL`, `PLATFORM_ADMIN_KEY`) — verificado por presencia
      (no por valor) vía SSH.
- [x] VAPID configurado en GitHub Secrets, sincronizado al `.env` del VPS y
      cargado por `notification-service`. SMTP continúa siendo opcional y usa
      modo demo si sus credenciales no están configuradas.
- [ ] Automatizar una ejecución periódica end-to-end del flujo de login/signup en el dominio real —
      **no verificado en esta sesión** (se verificó el endpoint de
      signup vía `curl`, no un flujo completo de browser).

## Infraestructura Detectada (VPS, `docker-compose.prod.yml`)

| Artefacto | Presente | Notas |
|---|---|---|
| `Dockerfile` por servicio | ✅ | 4 servicios backend, Alpine, usuario no-root |
| `docker-compose.prod.yml` | ✅ | Postgres y los 4 microservicios **sin puertos publicados al host** — solo Caddy expone 80/443. Límites de memoria por contenedor (~2GB total, pensado para VPS 2-4GB) |
| Caddy (TLS automático) | ✅ | Let's Encrypt automático vía `API_DOMAIN`/`STATUS_DOMAIN`/`ACME_EMAIL`, headers de seguridad (HSTS, X-Frame-Options, etc.) |
| Firewall (ufw) + usuario no-root | ✅ | `Backend/scripts/00-vps-server-setup.sh` — solo SSH/80/443 abiertos |
| Backups Postgres | ✅ | Cron diario 3AM, retención 14 días (`Backend/postgres/backup.sh` + `01-vps-post-clone-setup.sh`) — **recomendado copiar periódicamente a storage externo**, hoy vive solo en el mismo disco |
| Monitoreo | ✅ | Uptime Kuma self-hosted en `status.logify.cl`, contenedores con `healthcheck` |
| Web Push | ✅ | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` almacenados en GitHub Secrets y sincronizados al `.env` del VPS durante el despliegue |
| Actualización PWA | ✅ | `sw.js` no se almacena en caché intermedia y el cliente recarga automáticamente cuando un nuevo service worker toma control |
| `render.yaml` / infra Render | ❌ (retirado) | Backend migrado de Render a VPS propio |

## Gaps reales vigentes (2026-08-09)

1. **Quality Gate de SonarCloud no requerido por branch protection.** El análisis del PR #23 falló por 13,7% de cobertura sobre código nuevo (mínimo configurado: 80%), aunque los seis checks requeridos y el job de escaneo pasaron. Debe decidirse si se agregan tests de interfaz suficientes o si se ajusta una política de cobertura realista para cambios semánticos de JSX.
2. **No hay endpoint de versión** que exponga qué commit corre cada servicio; el script de despliegue conoce los SHA, pero la verificación externa sigue limitada al health check.
3. **SMTP depende de secretos de producción.** Si no está configurado, email funciona en modo demo; VAPID ya está configurado y automatizado.
4. **Observabilidad parcial.** Ya existen logs JSON y `X-Request-ID` propagado entre servicios; faltan APM/error tracking, métricas y agregación centralizada.
5. **Backups en el mismo VPS.** Existe cron diario con retención, pero falta una copia externa automatizada y una prueba periódica de restauración.
6. **Compensación Saga parcial.** El stock se revierte automáticamente si falla shipping, pero una falla de esa compensación todavía requiere intervención manual y un runbook detallado.
7. ~~**Dependencias HIGH conocidas en Nodemailer/Next/Swiper/React Router.**~~ Resuelto el 2026-08-08; los seis proyectos quedan sin vulnerabilidades de producción reportadas por npm audit.

## Gaps cerrados desde la auditoría inicial

- [x] CD automático al VPS después de CI verde.
- [x] Reinicio explícito del gateway cuando cambia su configuración.
- [x] Health check público post-deploy y rollback automático al SHA anterior.
- [x] Monitoreo básico con Uptime Kuma.
- [x] Actions actualizadas y fijadas por SHA; SonarQube Scan Action v6.
- [x] Auditoría de dependencias, SBOM, CodeQL, secretos y Trivy automatizados.
