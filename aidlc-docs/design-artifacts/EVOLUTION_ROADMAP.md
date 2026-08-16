# Evolution Roadmap — Logify Comercial (Bsale/Tuin/Fudo)

**Estado:** Planificación — Fase P0.1 "refactor modular de `inventory-service`" completada el 2026-08-14 (ver nota de corrección más abajo). El resto de las fases no ha comenzado a construirse.
**Depende de:** [`../requirements/EVOLUTION_INTENT.md`](../requirements/EVOLUTION_INTENT.md) (el porqué y los límites) y [`../requirements/BSALE_TUIN_FUDO_SOURCE.md`](../requirements/BSALE_TUIN_FUDO_SOURCE.md) (el análisis funcional completo, 27 secciones).
**Arquitectura base:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) y [`DOMAIN_MODEL.md`](./DOMAIN_MODEL.md) — este roadmap extiende esos documentos, no los reemplaza.

Este documento traduce el análisis de 27 secciones de la fuente en fases ejecutables mapeadas a los 4 servicios reales que existen hoy (`orders-service`, `inventory-service`, `shipping-service`, `notification-service`) y a los servicios nuevos que la fuente propone crear. Cada fase indica **qué archivo/tabla real se toca**, no solo el concepto abstracto.

---

## 0. Regla de secuencia

No hay atajos entre fases. La fuente es explícita (§2, §5, §18): construir Commerce, Food o el editor visual de tienda antes de tener P0 completo produce una plataforma con estados desincronizados. El orden abajo es obligatorio salvo decisión explícita del Product Owner documentada como excepción.

Cada fase sale detrás de un `feature_flags` por tenant (tabla nueva `tenant_feature_flags` o extensión de `tenants.settings` JSONB, que ya existe en `orders_db`) y se activa primero en un tenant piloto interno.

---

## Fase P0.1 — Base operativa (prerequisito de todo lo demás)

**Objetivo verificable:** el modelo de datos soporta sucursales/bodegas, catálogo normalizado, kardex y permisos granulares — sin que el usuario final note ningún cambio de comportamiento todavía.

> **Corrección post-refactor (2026-08-14):** al ejecutar el refactor modular de `inventory-service` se confirmó que este documento (heredado de `ARCHITECTURE.md`/`DOMAIN_MODEL.md`, desactualizados) describía mal el estado real del código. `inventory-service` **ya tenía**, antes de este refactor, tablas de `suppliers`, `purchases` y `cash_sessions`, y soporte de variantes vía `inventory.parent_sku` — evolucionadas de forma incremental bajo comentarios de "Fase 1/2/3 del roadmap de expansión comercial" que no estaban documentados en ningún archivo de `aidlc-docs/` hasta ahora. Es decir, **la fila "Caja auditable, pagos integrados y conciliación" del gap #4 en `EVOLUTION_INTENT.md` estaba parcialmente resuelta ya**: existe sesión de caja con apertura/cierre y arqueo (`cash_sessions`), aunque todavía no hay integración de pasarela de pago ni conciliación con un adquirente externo. Ver el estado real completo en `inventory-service/src/db/schema.js` (post-refactor).

**Qué se toca:**

| Área | Servicio/archivo real | Cambio | Estado |
|---|---|---|---|
| Refactor modular | `inventory-service/src/index.js` (869 líneas → dividido) | Separar en `routes/`, `db/`, `lib/` antes de agregar DTE/pagos — hoy todo vivía en un único archivo por servicio (confirmado, ver `DOMAIN_MODEL.md` línea 3) | ✅ Hecho 2026-08-14: `inventory-service/src/{index.js, db/schema.js, db/procedures.js, lib/inventory-csv.js, routes/*.routes.js}`. Cero cambio de comportamiento (122/122 tests existentes pasan sin modificarse); `orders-service/src/index.js` (1257 líneas) queda pendiente para un PR futuro con el mismo enfoque. |
| Jerarquía operativa | `inventory_db` (nueva) | Tablas `branches`, `warehouses`, `stock_locations` — jerarquía `tenant → branch → warehouse → stock_location` |
| Kardex | `inventory_db` | Reemplazar `inventory.stock` (entero directo) por `stock_balances(variant_id, warehouse_id, on_hand, reserved, incoming)` + `stock_movements` (ledger inmutable) siguiendo el mismo patrón de `fn_adjust_stock` (SP con `SELECT FOR UPDATE`) que ya existe, no un `UPDATE` directo |
| Catálogo | `inventory_db` | `products` + `product_variants` reemplazando la tabla plana `inventory`; migración conserva `sku`/`price`/`cost`/`category` actuales como columnas de `product_variants` |
| Permisos | `orders_db` (auth vive en `orders-service`) | `roles`, `permissions`, `role_permissions`, `user_scopes` — evolución del enum fijo de 7 roles actual hacia permisos verbales con ámbito (tenant/sucursal/bodega) |
| Idempotencia/outbox | Todos los servicios | `Idempotency-Key` obligatorio en endpoints sensibles; tabla `outbound_deliveries`/outbox — la tabla `processed_events` ya existe en `inventory_db` pero está **sin uso** (confirmado en `DOMAIN_MODEL.md` línea 72); reactivarla es el punto de partida, no crear una nueva desde cero |

**Migración (Etapa 1-2 de la fuente §14):**
1. Introducir sucursal/bodega con **una sola sucursal y una sola bodega por tenant** al inicio — no rompe el comportamiento actual.
2. Crear saldo inicial de `stock_balances` como movimiento `opening` derivado del valor actual de `inventory.stock` por tenant.
3. Doble lectura temporal: el endpoint de stock actual sigue respondiendo desde `inventory.stock` mientras `stock_movements` se llena en paralelo, hasta reconciliar tenant por tenant.
4. Bloquear cualquier escritura directa a `inventory.stock`; todo pasa por el servicio de kardex.

**Criterio de aceptación:** los reportes actuales de inventario (`fn_get_inventory_report`) devuelven los mismos números leyendo desde `stock_balances` que los que devolvían leyendo `inventory.stock`, para todos los tenants existentes, antes de eliminar la columna vieja.

---

## Fase P0.2 — Venta fiscal mínima

**Objetivo verificable:** el POS emite boleta/factura, cobra, descuenta stock del kardex nuevo, abre/cierra caja y consulta estado SII, sin duplicaciones ante reintento.

**Servicios nuevos (según fuente §3.3):**
- `fiscal-service` — folios, CAF, firma, DTE, envío/consulta SII, PDF, auditoría. Empieza como **adaptador a un proveedor DTE certificado** (Bsale o relBase — decisión pendiente por spike, ver `EVOLUTION_INTENT.md` §6), nunca acoplado directamente en `orders-service`.
- `payment-service` — puede arrancar como módulo interno dentro de `orders-service` y separarse antes de producción; intents, terminales, webhooks, reembolsos, conciliación. Primer proveedor: Mercado Pago (Checkout Pro, luego Point/QR) por ser el único de los evaluados con procesamiento de pagos habilitado en Chile (fuente §21.1, §22.4-22.5).

**Qué se toca en servicios existentes:**
- `orders-service`: nueva entidad `commercial_documents` que unifica `orders` (pedido logístico) y `sales` (venta POS) como dos orígenes del mismo concepto de documento — sin fusionar sus tablas, solo su modelo de referencia (`document_references`).
- `inventory-service`: **`cash_sessions` ya existe** (apertura/cierre, monto esperado vs. contado, diferencia — ver `routes/cash-sessions.routes.js` post-refactor), corrección frente a lo que decía este documento antes del 2026-08-14. Falta el detalle de movimientos individuales dentro de una sesión (`cash_movements`: ingresos/egresos/depósitos aparte de la venta), que sí es trabajo nuevo de esta fase.

**Reglas no negociables (fuente §6.9, ya coherentes con el patrón Saga existente):**
- Endpoint de emisión de DTE recibe `Idempotency-Key`, igual que el patrón que ya usa la Saga de confirmación de pedido en `orders-service`.
- Un folio reservado nunca se asigna a dos documentos — mismo principio que `client_code` único que ya se aplica en `orders`.
- Secretos SII/certificados nunca en frontend ni logs — mismo estándar que ya aplica a JWT/bcrypt en `shared/security`.

---

## Fase P1 — Ciclo Bsale completo + inventario/compras

- Cotización, nota de venta, guía, devolución, nota de crédito/débito, abono, cobranza, impresión — construido sobre `commercial_documents` de P0.2.
- Recepciones, consumos, transferencias, inventarios físicos, costos, alertas — construido sobre el kardex de P0.1.
- `purchases` (ya existe en Logify según `ARCHITECTURE.md`/README de features) evoluciona a `purchase_orders` + `goods_receipts` con recepción parcial.

## Fase P2 — Comercial + Logify Stock

- Listas de precios, promociones, cupones, puntos, clientes avanzados, dashboards.
- **Logify Stock**: PWA móvil nueva (no una vista más del Frontend actual) para conteo/escaneo offline-first, inspirada en Tuin (fuente §7). Comparte API/auth/tipos con el Frontend actual pero tiene navegación y almacenamiento offline propios (IndexedDB con `client_operation_id` para deduplicación de conflictos).

## Fase P3 — Commerce + Plataforma

- **Logify Commerce**: `commerce-service` nuevo — storefront, checkout, pedido web, zonas/tarifas de despacho reutilizando `shipping-service` existente.
- API pública `/public-api/v1`, webhooks salientes, Integration Hub (fuente §21-23) para conectores Bsale/Loyverse/relBase/Mercado Pago/Square.

## Fase P4 — Logify Food (opcional, detrás de feature flag)

- Solo después de que P0-P3 estén estables en producción y haya demanda real validada. Vive en tablas/rutas propias (`dining_areas`, `kitchen_tickets`, `recipes`, etc.) para no contaminar el núcleo generalista, según regla explícita de la fuente §3 y §8.

---

## Servicios: mapa antes/después

```
HOY (4 servicios)                         DESPUÉS DE P0-P3 (8 servicios)
orders-service      :8081        →        orders-service      (+ commercial_documents, permisos)
inventory-service   :8082        →        inventory-service   (+ kardex, sucursales, catálogo rico)
shipping-service    :8084        →        shipping-service    (+ zonas/tarifas ecommerce)
notification-service:8085        →        notification-service (+ motor de automatizaciones)
                                  →        fiscal-service       (nuevo — DTE/SII)
                                  →        payment-service      (nuevo — pagos/conciliación)
                                  →        commerce-service     (nuevo — storefront/checkout web)
                                  →        billing-service      (nuevo o dentro de orders-service — planes SaaS de Logify)
```

El Nginx/BFF actual (`Backend/nginx/`) sigue siendo la única entrada pública del panel; los nuevos servicios se agregan como rutas del mismo gateway, no como puntos de entrada adicionales.

---

## Qué queda explícitamente para después de este roadmap

Documentado en la fuente pero no priorizado en P0-P4 porque depende de validación legal/negocio, no de ingeniería:

- Marco de protección de datos personales chileno completo (Ley 21.719, vigente desde 2026-12-01) — fuente §24-25. Requiere revisión legal antes de convertirse en tickets de ingeniería; el roadmap de seguridad mínima (cifrado, RBAC, auditoría) ya está cubierto por P0.1.
- Conectores de integración más allá de Mercado Pago y un proveedor DTE (Bsale import/migración, Loyverse OAuth, Square) — fuente §26, priorizados P1-P3 en la tabla de esa sección, pero condicionados a demanda real de clientes con esos sistemas.

## Siguiente paso concreto

Antes de escribir el primer ticket de P0.1: validar con el Product Owner (a) el proveedor DTE elegido por spike y (b) si el refactor modular de `orders-service`/`inventory-service` se hace como PR único de "solo mover código" (sin cambiar comportamiento) antes de tocar el modelo de kardex, o si ambos se combinan. La fuente recomienda separar ambos para no mezclar riesgo de refactor con riesgo de migración de datos.
