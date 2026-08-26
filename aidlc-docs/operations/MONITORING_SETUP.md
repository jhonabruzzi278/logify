# Monitoring Setup

**Estado al 2026-08-25: monitoreo básico operativo; observabilidad avanzada pendiente.**

La auditoría del 2026-08-25 confirmó Uptime Kuma, TLS y healthchecks sanos,
pero detectó que el cron de backup llevaba 19 días sin producir copias. Se
reparó el instalador y el cron, se generaron cuatro dumps y todos restauraron
correctamente en PostgreSQL temporal. La disponibilidad HTTP no detectó ese
fallo, por lo que una alerta por antigüedad del último backup sigue siendo
prioritaria. Ver
[`PRODUCTION_AUDIT_2026-08-25.md`](PRODUCTION_AUDIT_2026-08-25.md).

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
- Agregación centralizada de los logs JSON existentes.
- Alertas de disco, memoria, expiración TLS y fallos/antigüedad de backup.
- SLO operativos medibles y revisión periódica de incidentes.

Uptime Kuma cubre disponibilidad externa, pero no reemplaza trazas, métricas,
logs centralizados ni captura de errores del cliente.
