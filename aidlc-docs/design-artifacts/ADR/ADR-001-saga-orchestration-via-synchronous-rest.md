# ADR-001: Orquestación Saga vía REST síncrono (sin broker de mensajería)

**Status:** Aceptado (implementado)
**Fecha inferida:** presente en el código desde etapas tempranas de Construction; no hay fecha exacta documentada.

## Contexto

La confirmación de un pedido requiere coordinar tres operaciones en tres servicios distintos con sus propias bases de datos (descuento de stock en inventory-service, creación de envío en shipping-service, y registro de evento en notification-service). Al ser Database-per-Service, no existe una transacción distribuida ACID nativa disponible.

## Decisión

Implementar el patrón Saga por **orquestación**: orders-service actúa como orquestador central y llama secuencialmente, vía HTTP síncrono (`req.forwardedFetch`, que propaga el JWT y el header de tenant), a inventory-service y luego a shipping-service. No se usa ningún broker de mensajería (Kafka/RabbitMQ/Redis pub-sub) ni coreografía basada en eventos.

## Consecuencias

**Positivas:**
- Simplicidad de implementación e infraestructura — no hay broker que operar, monitorear o pagar.
- Flujo de ejecución fácil de razonar y depurar (llamadas HTTP lineales, trazables con logs simples).
- Consistente con el tamaño del equipo y el objetivo de costo $0/mes.

**Negativas:**
- **Sin rollback automático (compensación)** ante fallo parcial: si el descuento de stock tiene éxito pero la creación del envío falla, el error se registra en un campo `warnings` de la respuesta pero el pedido avanza igual de estado. La compensación es manual (documentado explícitamente en `wiki/Arquitectura.md`).
- **Acoplamiento temporal fuerte:** orders-service depende de que inventory-service y shipping-service estén disponibles y respondan rápido en el momento exacto de la llamada — sin colas de reintento, sin dead-letter queue.
- **Latencia acumulada:** la confirmación de un pedido es tan lenta como la suma secuencial de las 3 llamadas, sin paralelización.
- Especialmente riesgoso en el entorno de despliegue actual (Render free tier), donde los servicios "duermen" tras 15 min de inactividad — una llamada Saga puede fallar o tardar 30-60s adicionales por cold start de un servicio downstream.

## Alternativas consideradas

⚠️ No hay documentación explícita de que se hayan evaluado alternativas (ej. Saga por coreografía con eventos, transacciones distribuidas con 2PC, un broker ligero como Redis Streams). Se infiere que la decisión priorizó velocidad de desarrollo y costo de infraestructura sobre resiliencia — razonable para la etapa actual del proyecto, pero **debe revisarse antes de operar con tráfico de producción real**, dado que el propio `RENDER_DEPLOY.md` advierte que la configuración actual "no es para tráfico real constante".

## Evidencia de preparación futura

La tabla `processed_events` (con `event_type`+`event_key` como PK compuesta) existe en los esquemas de `inventory_db` y `shipping_db` pero está sin uso — sugiere que se planeó una migración futura a mensajería idempotente que no se completó.
