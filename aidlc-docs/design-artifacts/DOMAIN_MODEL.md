# Domain Model (DDD)

El código no está organizado explícitamente como DDD (no hay carpetas `domain/`, `aggregates/`, etc. — cada servicio es un único `src/index.js` con rutas, SQL y lógica de negocio inline). Este documento mapea el dominio real *implícito* en el código y el esquema de base de datos a conceptos DDD, para servir de referencia de diseño.

## Bounded Contexts

El sistema tiene 4 bounded contexts, uno por microservicio, cada uno con su propia base de datos (Database-per-Service):

1. **Orders Context** (`orders_db`) — pedidos, clientes, usuarios/auth, tenants
2. **Inventory Context** (`inventory_db`) — catálogo de productos, stock, ventas POS
3. **Shipping Context** (`shipping_db`) — envíos, tracking, validación de entrega
4. **Notification Context** (`notification_db`) — trazabilidad de eventos, suscripciones push

No hay un modelo compartido único; cada contexto tiene su propia noción de "orden" identificada por `order_id`/`sku` como referencia lógica cruzada (no hay foreign keys físicas entre bases de datos distintas — limitación conocida de Database-per-Service, documentada en `docs/technical/02-persistencia.html`).

---

## Bounded Context: Orders

### Aggregates
- **Order** (Aggregate Root) — `orders` table
  - Fields: `id`, `customer_id`, `sku`, `quantity`, `status`, `client_code` (unique, `SL-XXXXXX`), `assigned_to`, `cancel_reason`, `tenant_id`, `created_at`
  - Invariants: `client_code` único por tenant; `status` sigue la máquina de estados `CREATED → EN_PREPARACION → EN_REPARTO → ENTREGADO`, o `CANCELADO` desde cualquiera de los tres primeros
  - Domain behavior: `confirm()` (dispara Saga), `cancel(reason)` (restaura stock si aplica), `assign(transporter)`, `advance(status)`

- **Customer** (Aggregate Root, independiente) — `customers` table
  - Fields: `id`, `name`, `phone`, `address`, `email`, `rut`, `tenant_id`
  - Value Object embebido: **RUT chileno** (validado con algoritmo módulo 11, formato `XX.XXX.XXX-X`)

- **User** (Aggregate Root, independiente) — `users` table
  - Fields: `id`, `username`, `password_hash`, `role`, `rut`, `email`, `secret_question`, `secret_answer_hash`, `tenant_id`
  - Value Object: **Role** (enum: owner, ops, warehouse, shipper, vendor, support, customer)
  - Invariant: `username` único por tenant

- **Tenant** (Aggregate Root, plataforma) — `tenants` table
  - Fields: `id`, `slug` (unique), `name`, `status` (trial|active|suspended|cancelled), `plan`, `contact_email`, `settings` (JSONB)

### Value Objects
- **ClientCode**: string inmutable con formato `SL-` + 6 caracteres alfanuméricos mayúsculas, generado una vez, nunca modificado — funciona como token de verificación de identidad, no solo como ID de negocio.
- **RUT**: string validado con checksum módulo 11.
- **OrderStatus**: enum cerrado (`CREATED`, `EN_PREPARACION`, `EN_REPARTO`, `ENTREGADO`, `CANCELADO`).

### Repository
- Implementado como funciones SQL inline en `orders-service/src/index.js` (sin capa de repositorio explícita/nombrada) + 2 stored procedures: `fn_get_orders_with_customer`, `fn_cancel_order`.

### Domain Events (implícitos — no hay un event bus real)
- `OrderConfirmed`, `OrderCancelled`, `OrderAssigned`, `OrderStatusChanged` — estos "eventos" se materializan como llamadas HTTP síncronas salientes hacia inventory-service, shipping-service, y como registros POST hacia notification-service. No existen como mensajes de dominio formales ni se publican a un broker.

---

## Bounded Context: Inventory

### Aggregates
- **Inventory** (Aggregate Root) — `inventory` table
  - Fields: `id`, `sku` (unique por tenant), `name`, `stock`, `price`, `cost`, `category`, `image_url`, `tenant_id`
  - Invariant: `stock >= 0` siempre (enforced por `fn_adjust_stock`, que rechaza ajustes que dejarían stock negativo)
  - Domain behavior: `adjustStock(delta)` — operación atómica con row-level locking

- **Sale** (Aggregate Root, independiente — no referencia a Order) — `sales` table
  - Fields: `id`, `sku`, `quantity`, `sale_date`, `sale_group`, `payment_method`, `vendor_id`, `vendor_name`, `unit_price`, `total`, `tenant_id`
  - Representa ventas de punto de venta (POS), un flujo de negocio paralelo al de Order que también descuenta stock directamente

### Value Objects
- **StockLevel**: clasificación derivada (no almacenada), calculada por `fn_get_inventory_report`: `SIN_STOCK` (0), `CRITICO` (<10), `BAJO` (<30), `NORMAL` (resto).
- **SKU**: string identificador único de producto por tenant.

### Repository / Stored Procedures
- `fn_adjust_stock(sku, delta, tenant_id)` — ajuste atómico con `SELECT ... FOR UPDATE`.
- `fn_get_inventory_report(tenant_id)` — reporte clasificado.

### Notas de diseño
- Tabla `processed_events` (`event_type`, `event_key` como PK compuesta) existe en el esquema pero está **sin uso actual** — diseñada para idempotencia de un futuro consumidor de eventos asíncronos que aún no existe. Es deuda de diseño / preparación incompleta para mensajería.

---

## Bounded Context: Shipping

### Aggregates
- **Shipment** (Aggregate Root) — `shipments` table
  - Fields: `id`, `order_id`, `customer_id`, `sku`, `quantity`, `status`/`stage`, `tracking_number` (`TRACK-XXXXXXXX`, unique), `shipped_at`, `customer_code`, `recipient_rut`, `proof_of_delivery_image`, `tenant_id`, `created_at`, `updated_at`
  - Invariant: transición `ENTREGADO` requiere validación cruzada de `customer_code` + `recipient_rut` contra el Orders context (llamada HTTP síncrona, no una FK)
  - Domain behavior: `advanceStage(stage)`, `confirmDelivery(customerCode, recipientRut, proofImage)`

### Value Objects
- **TrackingNumber**: `TRACK-` + 8 caracteres alfanuméricos, único e inmutable.
- **ShipmentStage**: enum (`EN_PREPARACION`, `EN_REPARTO`, `ENTREGADO`, `CANCELADO`).
- **DeliveryRisk**: derivado de la integración con Open-Meteo (`ALTO` si `weatherCode >= 51`), no persistido.

---

## Bounded Context: Notification

### Aggregates
- **NotificationRecord** (Aggregate Root) — `notification_records`/`notifications` table
  - Fields: `id`, `event_id`, `order_id`, `customer_id`, `stage`, `status`, `message`, `target_audience` (CLIENT|OPERATOR|BOTH), `source_service`, `occurred_at`, `tenant_id`
  - Invariant: único por `(tenant_id, event_id, audience)` — este es el mecanismo de idempotencia (POST duplicado devuelve 409)

- **PushSubscription** (Aggregate Root, independiente) — `push_subscriptions` table
  - Fields: `endpoint`, `p256dh`, `auth`, `username`, `tenant_id`
  - Representa una suscripción de navegador a Web Push

### Domain behavior
- Este contexto actúa como **sumidero de eventos** (event sink) de los otros tres — es el más cercano a un "domain event store" real del sistema, aunque alimentado por llamadas HTTP directas en vez de una suscripción a un bus de eventos.

---

## Cross-Cutting Concern: Multi-Tenancy

No es un bounded context en sí, sino un aspecto transversal aplicado a **todos** los agregados anteriores vía columna `tenant_id` + índices únicos compuestos por tenant. El `tenant_id` se deriva exclusivamente del JWT verificado (nunca de un header de request sin autenticar) — ver `design-artifacts/ARCHITECTURE.md` y `ADR/ADR-002-multi-tenant-shared-schema-per-service.md`.
