# SLA Definition

**Estado al 2026-08-08: no existe un SLA contractual publicado.**

Logify opera en producción sobre un VPS propio para el backend y Vercel para
Frontend/Landing. Ya no aplican las limitaciones históricas de cold start de
Render/Neon descritas en versiones antiguas de este documento.

## Capacidades operativas existentes

- Monitoreo de disponibilidad mediante Uptime Kuma.
- Health checks de aplicación y base de datos.
- CI obligatorio antes de integrar cambios en `main`.
- Despliegue automático con verificación externa y rollback.
- Backups diarios de PostgreSQL con retención local de 14 días.
- Registro de incidentes mediante post-mortems.

## Antes de prometer un SLA

- Medir uptime real durante un periodo representativo.
- Definir SLO de disponibilidad y latencia p95/p99.
- Automatizar copias externas y pruebas de restauración.
- Confirmar canales de alerta y responsables de respuesta.
- Definir ventanas de mantenimiento y comunicación de incidentes.
- Incorporar APM, logs correlacionados y error tracking.

Hasta que el Product Owner defina esos compromisos y exista evidencia
operativa suficiente, no debe publicarse un porcentaje de disponibilidad ni
un tiempo de respuesta contractual inventado.
