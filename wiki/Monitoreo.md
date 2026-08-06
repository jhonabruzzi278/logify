# Monitoreo — Uptime Kuma

Página pública de status (estilo status.claude.com), gratis y self-hosted en
el mismo VPS del backend. No requiere cuenta externa ni tarjeta de crédito.

## Qué es

[Uptime Kuma](https://github.com/louislam/uptime-kuma) es un monitor de
uptime open source con una página de status pública lista para usar:
gráfico de uptime por servicio, historial de incidentes, subida/caída en
tiempo real. Corre como un contenedor más en `docker-compose.prod.yml`
(servicio `uptime-kuma`), expuesto solo internamente — Caddy es quien lo
publica en `https://status.logify.cl` con TLS automático.

## Puesta en marcha (una sola vez)

1. Configurar DNS: agregar un registro **A** para `status.logify.cl`
   apuntando a la IP del VPS (igual que hiciste con `api.logify.cl`).
2. En el `.env` del VPS, agregar:
   ```
   STATUS_DOMAIN=status.logify.cl
   ```
3. Desplegar (o redesplegar) con `docker-compose.prod.yml` — esto levanta
   `uptime-kuma` y Caddy emite el certificado TLS automáticamente para el
   nuevo dominio:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Abrir `https://status.logify.cl` — la primera vez pide crear el usuario
   admin (usuario/contraseña, guardalo en el gestor de contraseñas del
   equipo). Esto es exclusivo de la UI de Uptime Kuma, no hay forma de
   bootstrapear el usuario por variable de entorno.

## Monitores recomendados

Desde el panel de admin (`https://status.logify.cl/dashboard`), crear un
monitor **HTTP(s)** por cada uno de estos, todos con intervalo de 60s:

| Nombre | URL | Notas |
|--------|-----|-------|
| API Gateway | `https://api.logify.cl/healthz` | Punto de entrada único |
| Orders | interno — no exponer, monitorear vía API Gateway | ver nota abajo |
| Inventory | interno — no exponer, monitorear vía API Gateway | ver nota abajo |
| Shipping | interno — no exponer, monitorear vía API Gateway | ver nota abajo |
| Notification | interno — no exponer, monitorear vía API Gateway | ver nota abajo |
| Frontend | `https://app.logify.cl` (o el dominio real en Vercel) | Monitor tipo "HTTP(s) - Keyword" o simple "up" |
| Landing | `https://logify.cl` | Monitor tipo "HTTP(s)" |

**Nota sobre los 4 microservicios:** en `docker-compose.prod.yml` no
publican puertos al host (solo red interna de Docker), así que Uptime Kuma
—que corre en la misma red `logify-net`— **sí** puede alcanzarlos
directamente por su hostname interno. Agregar un monitor HTTP(s) por cada
uno apuntando a:

- `http://orders-service:8081/health`
- `http://inventory-service:8082/health`
- `http://shipping-service:8084/health`
- `http://notification-service:8085/health`

Esto da visibilidad por servicio individual (no solo "algo detrás del
gateway falló"), sin exponer nada nuevo al público.

## Notificaciones de incidentes

En cada monitor, pestaña "Notifications", Uptime Kuma soporta (todo gratis):
Telegram, Discord, Slack, email (SMTP — se puede reusar el mismo
`SMTP_HOST`/`SMTP_USER` del `.env` del proyecto), webhooks genéricos, y
más de 90 integraciones. Configurar al menos una para no depender de
revisar la página manualmente.

## Página pública

Desde "Status Pages" en el panel, crear una página pública, agregar los
monitores que quieras mostrar (probablemente todos menos los 4
microservicios internos, que son detalle de implementación), y publicarla.
Queda servida directamente en `https://status.logify.cl`.

## Backup

`uptime-kuma` guarda su estado (monitores, historial, usuarios) en el
volumen `uptime_kuma_data`. Igual que `postgres_data`, conviene incluirlo
en el backup periódico del VPS (ver `Backend/postgres/backup.sh` como
referencia del patrón usado en este proyecto).
