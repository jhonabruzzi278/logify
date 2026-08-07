# Deployment Checklist

> **Actualizado 2026-08-06** tras auditoría de production-readiness +
> incidente real de producción (ver
> `operations/POST_MORTEMS/2026-08-06-signup-404-produccion.md`). El
> checklist original (basado en `RENDER_DEPLOY.md`, cuando el backend
> vivía en Render) queda obsoleto desde que el backend se movió a VPS
> propio — ver `wiki/Despliegue-VPS.md`. Se conserva la estructura, no
> el contenido viejo.

## Estado real al 2026-08-06

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
      (464+ tests, 81-88% por servicio backend).
- [x] CI/CD configurado — `.github/workflows/ci.yml` corre tests en los
      4 microservicios + Frontend (typecheck+test+build) + Landing
      (build) en cada PR y push a `main`, con branch protection.
      **Nota:** GitHub Actions tuvo un Major Outage a nivel de
      plataforma el 2026-08-06 (~16:33 UTC en adelante) que dejó 2 runs
      en `queued` indefinidamente — no es un problema de configuración
      del repo, ver post-mortem para cómo se resolvió sin esperar al CI.
- [x] Secrets no commiteados — `.env` nunca trackeado por git (verificado
      con `git ls-files`), `.gitignore` lo cubre en raíz/Backend/Frontend/Landing.
- [x] `.env` de producción en el VPS tiene todas las variables
      obligatorias definidas (`POSTGRES_PASSWORD`, `DB_RUNTIME_PASSWORD`,
      `JWT_SECRET`, `ALLOWED_ORIGINS`, `API_DOMAIN`, `STATUS_DOMAIN`,
      `ACME_EMAIL`, `PLATFORM_ADMIN_KEY`) — verificado por presencia
      (no por valor) vía SSH.
- [ ] `SMTP_HOST` / VAPID keys — vacíos en el VPS actualmente: el
      sistema corre en modo demo de email (logueado a consola, no
      enviado) y sin Web Push activo. No bloqueante, pero pendiente si
      se necesita envío de correo real o notificaciones push.
- [ ] Test end-to-end del flujo de login/signup en el dominio real —
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
| `render.yaml` / infra Render | ❌ (retirado) | Backend migrado de Render a VPS propio |

## Gaps reales identificados (2026-08-06)

1. **El despliegue al VPS es 100% manual** (`git pull` + `docker compose up -d --build`) — sin CD automático al mergear a `main`. Esto fue la causa raíz del incidente de hoy: varios PRs se mergearon a `main` sin redesplegar el VPS, que quedó 9 commits atrás hasta esta sesión.
2. **Nginx (`nginx.conf`) se monta como volumen** — un `docker compose up -d --build` no lo recarga si solo cambió el contenido del archivo; hace falta `docker compose restart api-gateway` explícito. Ya causó confusión una vez (ver post-mortem).
3. **No hay endpoint de versión** que exponga qué commit corre cada servicio — dificulta detectar drift entre `main` y lo desplegado sin SSH manual.
4. **Dependencia `nodemailer` (orders-service, shipping-service, v6.9.16) con vulnerabilidades HIGH conocidas** (inyección SMTP, CRLF injection, SSRF vía `raw`) — fix requiere upgrade a v9.0.4 (breaking change), pendiente de programar.
5. **SonarCloud conectado pero sin Quality Gate configurado** (`status: NONE`) — el análisis corre en CI pero no bloquea el merge por sí mismo.
6. Sin plan de rollback documentado más allá de `git checkout <commit-anterior> && docker compose up -d --build`.
