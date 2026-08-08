# Monitoring Setup

**Estado al 2026-08-08: monitoreo básico operativo; observabilidad avanzada pendiente.**

## Implementado

- Uptime Kuma self-hosted y publicado mediante Caddy en `status.logify.cl`.
- Health checks de gateway y microservicios con verificación de base de datos.
- Docker `HEALTHCHECK` y dependencias de arranque condicionadas por salud.
- Health check público posterior a cada despliegue del VPS.
- Rollback automático al commit anterior si el despliegue no queda sano.
- Rotación de logs de Docker configurada por el script inicial del VPS.
- Post-mortems versionados en `operations/POST_MORTEMS/`.

La configuración detallada de monitores y notificaciones está en
`wiki/Monitoreo.md`; el flujo de despliegue y rollback está en
`wiki/Despliegue-VPS.md`.

## Pendiente

- Confirmar y probar al menos un canal de alerta de Uptime Kuma.
- APM y error tracking para Frontend y microservicios.
- Métricas técnicas y de negocio con histórico.
- Logging estructurado y centralizado.
- Generación y propagación de `X-Request-ID` entre gateway y servicios.
- Alertas de disco, memoria, expiración TLS y fallos de backup.
- SLO operativos medibles y revisión periódica de incidentes.

Uptime Kuma cubre disponibilidad externa, pero no reemplaza trazas, métricas,
logs centralizados ni captura de errores del cliente.
