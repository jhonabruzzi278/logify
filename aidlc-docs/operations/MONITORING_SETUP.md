# Monitoring Setup

**⚠️ Pendiente — el proyecto aún no llega a la fase de Operations con monitoring real implementado.**

## Lo que existe hoy (parcial, no es monitoring real)

- **Health checks** (`/health`, `/healthz`) en los 4 microservicios + gateway — verifican conectividad a BD, usados por Docker `HEALTHCHECK` y por `render.yaml`. Esto es *liveness checking* básico, no monitoring (no hay dashboards, no hay histórico, no hay alerting basado en estos checks más allá de lo que Render hace internamente para reiniciar un contenedor no saludable).
- **`Backend/shared/logger.js`**: wrapper simple de `console.log/warn/error/debug` con timestamp ISO. **No es logging estructurado** (sin JSON, sin niveles configurables por severidad, sin IDs de correlación de request entre los 4 servicios).
- Logs de Render/Vercel: accesibles vía sus dashboards nativos (retención limitada en plan free), no hay agregación centralizada externa (ej. no hay Datadog, Grafana Loki, ELK, Better Stack, etc.).

## Lo que falta genuinamente (no inferido, confirmado por ausencia total en el repo)

- Sin APM (Application Performance Monitoring) — no hay New Relic, Datadog APM, Sentry, ni equivalente.
- Sin métricas de negocio o técnicas expuestas (no hay endpoint `/metrics` estilo Prometheus).
- Sin dashboards.
- Sin alerting (no hay integración con PagerDuty, Opsgenie, o incluso un webhook simple a Slack/Discord ante caída de un servicio).
- Sin correlación de requests entre los 4 servicios (sin trace ID propagado en el header `X-Tenant-Slug`/JWT actual — sería el punto natural para añadir un `X-Request-ID`).
- Sin tracking de errores en Frontend (no hay Sentry/Bugsnag para capturar errores de cliente en producción).

## Recomendación mínima (no implementada — sugerencia de esta auditoría, no una decisión del equipo)

Dado el objetivo de costo $0/mes, opciones de bajo/nulo costo a evaluar cuando el proyecto entre a Operations real:
1. Reemplazar `shared/logger.js` por logging estructurado JSON (ej. Pino) — bajo esfuerzo, alto impacto para depurar el flujo Saga entre servicios.
2. Añadir un `X-Request-ID` generado en Nginx y propagado por `forwardedFetch` — permite correlacionar logs de una misma request a través de los 4 servicios.
3. Sentry (tiene un tier gratuito) para error tracking de Frontend y backend.
4. Un webhook simple de Render (falla de health check) hacia un canal de Discord/Slack como alerting mínimo viable.

Este documento debe reemplazarse con contenido real una vez que cualquiera de estas piezas se implemente — no antes.
