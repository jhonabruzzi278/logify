# SLA Definition

**⚠️ Pendiente — no existe ningún SLA (formal o informal) documentado en el repositorio.**

## Lo único relacionado a expectativas de servicio encontrado

`RENDER_DEPLOY.md` documenta, como característica conocida de la infraestructura elegida (no como un SLA prometido a usuarios), que:
- Los servicios backend en Render free tier "duermen" tras 15 minutos de inactividad, con cold start de 30-60 segundos en la siguiente request.
- El propio documento advierte explícitamente: *"no lo uses así para tráfico real constante"* — es decir, el equipo es consciente de que la configuración actual no sostiene una expectativa de disponibilidad de producción seria.
- Neon (BD) free tier también se auto-suspende tras 5 minutos de inactividad.

Esto implica que, tal como está desplegado hoy, el sistema **no puede ofrecer ningún SLA de disponibilidad o latencia creíble** — cualquier número que se documentara aquí sería inventado.

## Qué se necesitaría definir (cuando el proyecto tenga una decisión de negocio al respecto)

- Objetivo de uptime (ej. 99.5%) — requiere primero migrar fuera del free tier (Render "private service" ~US$7/mes/servicio, o una plataforma con mejor uptime garantizado)
- Objetivo de latencia p95/p99 por endpoint, especialmente para el flujo Saga de confirmación de pedido (que hoy es secuencial y síncrono entre 3 servicios)
- Ventanas de mantenimiento aceptables
- Política de comunicación ante incidentes

⚠️ **Pendiente validación humana / decisión de Product Owner.** No se debe inventar un SLA sin una decisión de negocio real detrás.
