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
- Consistente con el tamaño del equipo y una infraestructura de costo controlado.

**Negativas:**
- **Compensación limitada:** si el descuento de stock tiene éxito pero la creación del envío falla, orders-service revierte automáticamente el stock. Si esa segunda llamada también falla, responde con una advertencia explícita y requiere revisión manual.
- **Acoplamiento temporal fuerte:** orders-service depende de que inventory-service y shipping-service estén disponibles y respondan rápido en el momento exacto de la llamada — sin colas de reintento, sin dead-letter queue.
- **Latencia acumulada:** la confirmación de un pedido es tan lenta como la suma secuencial de las 3 llamadas, sin paralelización.
- El traslado a un VPS eliminó los cold starts históricos de Render, pero el riesgo de fallo parcial sigue vigente porque la coordinación continúa siendo HTTP síncrona y no hay reintentos persistentes ni cola de compensación.

## Alternativas consideradas

⚠️ No hay documentación explícita de que se hayan evaluado alternativas (ej. Saga por coreografía con eventos, transacciones distribuidas con 2PC, un broker ligero como Redis Streams). La migración de Render al VPS eliminó los cold starts y el flujo actual compensa el stock cuando shipping falla, pero la coordinación continúa siendo HTTP síncrona y una falla de la propia compensación requiere intervención manual.

## Evidencia de preparación futura

La tabla `processed_events` (con `event_type`+`event_key` como PK compuesta) existe en los esquemas de `inventory_db` y `shipping_db` pero está sin uso — sugiere que se planeó una migración futura a mensajería idempotente que no se completó.
