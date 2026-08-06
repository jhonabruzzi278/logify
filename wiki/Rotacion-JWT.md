# Rotación de JWT_SECRET

Los 4 microservicios (`orders`, `inventory`, `shipping`, `notification`)
comparten el mismo `JWT_SECRET`: el token se firma en `orders-service` (login)
y se verifica en los 4, porque no hay un servicio de auth centralizado.
Rotar ese secreto sin tumbar sesiones activas requiere una ventana de
solapamiento — para eso existe `JWT_SECRET_PREVIOUS`.

## Cómo funciona

- `signToken()` (`Backend/shared/auth.js`) **siempre** firma con `JWT_SECRET`.
- `verifyToken()` intenta primero con `JWT_SECRET`; si falla por firma
  inválida y existe `JWT_SECRET_PREVIOUS`, reintenta con ese.
- Mientras `JWT_SECRET_PREVIOUS` esté seteado, los tokens firmados con el
  secreto viejo siguen siendo válidos hasta que expiran naturalmente
  (`JWT_EXPIRES_IN`, por defecto 8h).

## Procedimiento

1. Generar el secreto nuevo: `openssl rand -base64 48`.
2. En el `.env` del VPS: mover el valor actual de `JWT_SECRET` a
   `JWT_SECRET_PREVIOUS`, y poner el secreto nuevo en `JWT_SECRET`.
3. Rolling restart de los 4 servicios (uno a la vez, no todos a la vez, para
   no tener downtime):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps orders-service
   docker compose -f docker-compose.prod.yml up -d --no-deps inventory-service
   docker compose -f docker-compose.prod.yml up -d --no-deps shipping-service
   docker compose -f docker-compose.prod.yml up -d --no-deps notification-service
   ```
4. Esperar al menos `JWT_EXPIRES_IN` (8h por defecto) para que todos los
   tokens viejos hayan expirado — durante esta ventana, tokens firmados con
   el secreto viejo y con el nuevo son válidos simultáneamente.
5. Pasado ese tiempo, dejar `JWT_SECRET_PREVIOUS=` vacío en el `.env` y hacer
   rolling restart de nuevo. A partir de acá, solo el secreto nuevo es
   válido.

## Cuándo rotar

- Cada 90 días como práctica de higiene (agregar a un recordatorio/cron
  operativo — no está automatizado).
- Inmediatamente si el secreto se filtró (log expuesto, commit accidental,
  acceso no autorizado al `.env` del VPS).

## Nota

Esto **no es rotación automática** — es un procedimiento manual documentado
que evita downtime. Automatizarlo (ej. con un secret manager) es una mejora
futura razonable si el equipo crece.
