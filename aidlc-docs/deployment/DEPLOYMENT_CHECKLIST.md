# Deployment Checklist

> **Actualizado 2026-08-25** tras revisión y remediación de producción, CI/CD,
> backups, acceso SSH, VAPID y caché PWA +
> incidente real de producción (ver
> `operations/POST_MORTEMS/2026-08-06-signup-404-produccion.md`). El
> checklist original (basado en `RENDER_DEPLOY.md`, cuando el backend
> vivía en Render) queda obsoleto desde que el backend se movió a VPS
> propio — ver `wiki/Despliegue-VPS.md`. Se conserva la estructura, no
> el contenido viejo.

## Estado real al 2026-08-25

El sistema **está desplegado y sirviendo tráfico real**: `logify.cl`,
`app.logify.cl`, `api.logify.cl` y `status.logify.cl` responden 200 con
TLS válido (verificado en esta auditoría). Esto ya no es un ejercicio de
"¿está listo para producción?" en abstracto — es un sistema en
producción validado en el commit `c1fdd05`, desplegado automáticamente tras el
PR #79.

## Pre-Deployment

- [x] Tests pasando en CI — commit `c1fdd05`: Orders 214, Inventory 122,
      Shipping 60, Notification 68 y Frontend 167; typecheck y ambos builds
      exitosos. SonarCloud, CodeQL, Gitleaks, Trivy y auditorías npm en verde.
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
| Firewall + acceso SSH | ✅ | UFW solo expone 12587/80/443; `deploy` autentica por llave; contraseña y X11 desactivados; root queda solo como recuperación por llave; Fail2ban activo |
| Backups Postgres | ⚠️ | Cron diario 3AM reparado, cuatro copias verificadas y restauradas en PostgreSQL temporal. Falta automatizar una copia fuera del VPS |
| Monitoreo | ✅ | Uptime Kuma self-hosted en `status.logify.cl`, contenedores con `healthcheck` |
| Web Push | ✅ | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` almacenados en GitHub Secrets y sincronizados al `.env` del VPS durante el despliegue |
| Actualización PWA | ✅ | `sw.js` no se almacena en caché intermedia y el cliente recarga automáticamente cuando un nuevo service worker toma control |
| `render.yaml` / infra Render | ❌ (retirado) | Backend migrado de Render a VPS propio |

## Gaps reales vigentes (2026-08-25)

1. **Copia externa de backups.** La generación, integridad y restauración están verificadas, pero los dumps todavía viven solo en el VPS. Su traslado requiere tratar los archivos como datos sensibles.
2. **Rotación de credencial root.** La autenticación SSH por contraseña está desactivada, pero la contraseña que se compartió durante la intervención debe cambiarse o bloquearse desde una sesión administrativa.
3. **Reinicio y actualizaciones pendientes.** El host ejecuta el kernel `5.15.0-187` y tiene instalado pendiente `5.15.0-190`; `apt` informa 20 paquetes actualizables después de refrescar índices. Programar ventana, actualizar, reiniciar y repetir smoke tests.
4. **Quality Gate como regla de rama.** El PR #79 pasó CI, Security y el Quality Gate de SonarCloud, incluida cobertura nueva superior al 80%; conviene exigir ese contexto en branch protection.
5. **No hay endpoint de versión** que exponga qué commit corre cada servicio; el commit se valida hoy mediante Git en el VPS.
6. **Observabilidad parcial.** Faltan APM/error tracking, métricas, agregación centralizada y una alerta por antigüedad del último backup.
7. **Compensación Saga parcial.** Una falla durante la reversión de stock todavía requiere intervención manual y un runbook específico.

Evidencia y remediaciones:
[`operations/PRODUCTION_AUDIT_2026-08-25.md`](../operations/PRODUCTION_AUDIT_2026-08-25.md).

## Gaps cerrados desde la auditoría inicial

- [x] CD automático al VPS después de CI verde.
- [x] Reinicio explícito del gateway cuando cambia su configuración.
- [x] Health check público post-deploy y rollback automático al SHA anterior.
- [x] Monitoreo básico con Uptime Kuma.
- [x] Actions actualizadas y fijadas por SHA; SonarQube Scan Action v6.
- [x] Auditoría de dependencias, SBOM, CodeQL, secretos y Trivy automatizados.
- [x] Signup público deshabilitado en producción (`503 SIGNUP_DISABLED`).
- [x] CORS rechazado de forma controlada (`403`) y preflight permitido (`204`).
- [x] Backup diario reparado y restauración de las cuatro bases probada.
- [x] SSH por contraseña/X11 desactivado; acceso `deploy` por llave, Fail2ban y
      UFW restringido a 12587/80/443.
- [x] Script destructivo no versionado retirado a cuarentena root recuperable.
