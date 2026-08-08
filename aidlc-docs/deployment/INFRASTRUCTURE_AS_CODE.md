# Infrastructure as Code

**Estado al 2026-08-08: infraestructura reproducible de forma parcial y
despliegue automatizado.**

## Artefactos versionados

| Artefacto | Propósito |
|---|---|
| `docker-compose.yml` | Stack local completo |
| `docker-compose.prod.yml` | Stack de producción en VPS, límites y health checks |
| `Backend/Caddyfile` | TLS, dominios públicos y proxy a gateway/Uptime Kuma |
| `Backend/nginx/` | API gateway y rutas de microservicios |
| `Backend/postgres/Dockerfile` + `init-db.sql` | Inicialización de las cuatro bases |
| `Backend/scripts/00-vps-server-setup.sh` | Usuario, firewall, Docker y rotación de logs |
| `Backend/scripts/01-vps-post-clone-setup.sh` | Permisos y cron de backups |
| `Backend/scripts/02-vps-deploy.sh` | Sincronización, despliegue, health check y rollback |
| `.github/workflows/ci.yml` | Gate de tests, builds y SonarCloud |
| `.github/workflows/deploy.yml` | CD del backend al VPS después de CI verde |
| `Frontend/vercel.json` | Rewrite SPA y headers del Frontend |

## Gestión de secretos

- Los valores de producción no están versionados.
- GitHub Secrets entrega credenciales SSH y configuración opcional SMTP al workflow de despliegue.
- El VPS conserva las variables obligatorias en `.env`.
- Vercel administra las variables de Frontend y Landing.

## Límites actuales

- El aprovisionamiento inicial del VPS, DNS, proyectos Vercel, Uptime Kuma y GitHub Secrets requiere intervención humana.
- No existe Terraform/Pulumi ni un proveedor declarativo para DNS/VPS/Vercel.
- Los backups se automatizan, pero su copia externa todavía no está declarada.
- El estado real de monitores de Uptime Kuma no se versiona en el repositorio.

Para el tamaño actual, los scripts idempotentes y Compose ofrecen una base
operable sin reintroducir IaC pesada. Si crecen los entornos o el equipo, debe
evaluarse automatizar DNS, provisioning, secretos y restauraciones.
