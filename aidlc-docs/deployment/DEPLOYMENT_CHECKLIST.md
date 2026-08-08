# Deployment Checklist

> **Actualizado 2026-08-08** tras revisión de producción, CI/CD y reglas de rama +
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
      La medición actual del 2026-08-08 registra 548 pruebas: 435 backend y 113 Frontend.
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
| `render.yaml` / infra Render | ❌ (retirado) | Backend migrado de Render a VPS propio |

## Gaps reales vigentes (2026-08-08)

1. **Quality Gate de SonarCloud no requerido por branch protection.** El análisis del PR #23 falló por 13,7% de cobertura sobre código nuevo (mínimo configurado: 80%), aunque los seis checks requeridos y el job de escaneo pasaron. Debe decidirse si se agregan tests de interfaz suficientes o si se ajusta una política de cobertura realista para cambios semánticos de JSX.
2. **No hay endpoint de versión** que exponga qué commit corre cada servicio; el script de despliegue conoce los SHA, pero la verificación externa sigue limitada al health check.
3. **SMTP y VAPID dependen de secretos de producción.** Si no están configurados, email funciona en modo demo y Web Push queda inactivo.
4. **Observabilidad básica, no completa.** Uptime Kuma cubre disponibilidad, pero faltan APM/error tracking, métricas, logs centralizados y `X-Request-ID` entre servicios.
5. **Backups en el mismo VPS.** Existe cron diario con retención, pero falta una copia externa automatizada y una prueba periódica de restauración.
6. **Saga sin compensación automática.** Un fallo downstream puede requerir intervención manual; falta un runbook operacional detallado y/o una estrategia de compensación.
7. **`nodemailer` continúa en 6.9.16** en orders/shipping; el salto a una versión mayor debe tratarse como actualización separada con pruebas de compatibilidad.

## Gaps cerrados desde la auditoría inicial

- [x] CD automático al VPS después de CI verde.
- [x] Reinicio explícito del gateway cuando cambia su configuración.
- [x] Health check público post-deploy y rollback automático al SHA anterior.
- [x] Monitoreo básico con Uptime Kuma.
