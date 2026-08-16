# Evolution Intent — Logify hacia un ERP/POS comercial (Bsale/Tuin/Fudo)

**Estado:** Documentación de planificación — sin cambios de código todavía.
**Fecha:** 2026-08-14
**Fuente de análisis:** [`BSALE_TUIN_FUDO_SOURCE.md`](./BSALE_TUIN_FUDO_SOURCE.md) (documento de 2380 líneas, análisis funcional de Bsale web, Tuin móvil y Fudo web, más el repo actual de Logify)
**Documento derivado:** [`../design-artifacts/EVOLUTION_ROADMAP.md`](../design-artifacts/EVOLUTION_ROADMAP.md) — hoja de ruta técnica fase por fase
**Relación con el intent original:** complementa, no reemplaza, [`INTENT.md`](./INTENT.md). El propósito original de Logify (logística de última milla con verificación de dos factores) se mantiene como núcleo; esta evolución añade la capa comercial/POS/fiscal que falta para competir con Bsale.

---

## 1. Por qué existe este documento

El dueño del producto entregó un análisis funcional de tres sistemas comerciales chilenos/regionales (Bsale, Tuin, Fudo) con instrucción explícita: **"no copiar marca ni diseño visual ni código, extraer patrones funcionales y adaptarlos a Logify"**. Este documento traduce ese análisis en intención de producto verificada contra el estado real del código, no contra las capturas de pantalla.

**Regla que gobierna todo lo que sigue:** cada gap que se menciona abajo fue confirmado leyendo el código real (`Backend/*/src/index.js`, `aidlc-docs/design-artifacts/DOMAIN_MODEL.md`, `ARCHITECTURE.md`), no asumido desde el documento de origen.

## 2. Qué es Logify hoy (verificado)

- 4 microservicios Node/Express: `orders-service` (1257 líneas, aún monolítico en un `src/index.js`), `inventory-service` (869 líneas, **refactorizado en capas `routes/`, `db/`, `lib/` el 2026-08-14** — ver `EVOLUTION_ROADMAP.md`), `shipping-service` (336 líneas), `notification-service` (281 líneas) — estos dos últimos aún monolíticos.
- Base de datos por servicio, SQL crudo + stored procedures, sin ORM ni migrador versionado.
- `inventory` es una tabla plana (sin `products`/`product_variants` separados): `sku`, `name`, `stock` (entero), `price`, `cost`, `category`, más `supplier_id`, `unit_of_measure`, `tax_rate`, `parent_sku`/`variant_label` ya agregados incrementalmente — sin sucursales, sin bodegas, sin kardex. El stock sigue siendo un contador global por tenant, no por ubicación.
- `orders` y `sales` (ventas POS) son flujos paralelos independientes — no comparten modelo de documento.
- No existe DTE/SII, no existe pasarela de pago integrada, no existe modelo de sucursal/bodega, no existe motor de precios/promociones, no existe app móvil de inventario.
- Multi-tenant por columna `tenant_id` derivada del JWT (no por base de datos separada), RBAC de 7 roles, Saga síncrona vía HTTP para confirmar pedidos.
- En producción activa desde 2026-08-06 (VPS + Vercel), con CI/CD, 226 tests.

Esto confirma el diagnóstico central del documento fuente (§2, §3.2): **Logify tiene una base arquitectónica sólida y coherente, pero le falta la cadena operativa comercial completa** (`catálogo → stock → POS/pedido → pago → DTE → entrega → devolución → caja → reporte`). No hace falta reescribir; hace falta extender el `inventory-service` y `orders-service` actuales y agregar servicios nuevos donde el dominio lo justifique.

## 3. Qué NO se va a hacer (alcance explícitamente descartado por ahora)

- **No** se copia el modelo de negocio de Bsale/Tuin/Fudo tal cual — cada patrón se adapta a la jerarquía multi-tenant y al flujo de verificación de entrega que ya son el diferenciador de Logify.
- **No** se construye un motor SII propio en la primera etapa — se usa un proveedor DTE certificado (Bsale o relBase) detrás de un adaptador (`FiscalProvider`), evaluado por spike técnico/comercial (ver fuente §26 "Criterio para elegir Bsale o relBase").
- **No** se construye Logify Food (módulo Fudo) hasta que el núcleo comercial esté estable y haya demanda validada — vive detrás de feature flags como vertical opcional.
- **No** se reescribe el stack (React/Vite/PWA en frontend, Node/Express/Postgres sin ORM en backend). La decisión es extender, no migrar de tecnología.
- **No** se activa ninguna fase (DTE, pagos, migración de stock a kardex) para todos los tenants simultáneamente — todo sale detrás de `feature_flags` por tenant, con piloto antes de generalizar.

## 4. Los 10 gaps priorizados (del documento fuente §2, confirmados contra el código)

En orden de bloqueo para competir con Bsale:

1. **Documentos tributarios electrónicos Chile (DTE/SII)** — no existe ningún campo, tabla ni endpoint fiscal en `orders-service` ni `inventory-service`.
2. **Sucursales, bodegas, stock por ubicación y kardex inmutable** — `inventory.stock` es hoy un único entero global por SKU y tenant; no hay concepto de ubicación.
3. **Catálogo más rico** (producto/servicio/pack, variantes, marca, tipo, atributos) — ⚠️ matizado 2026-08-14: `inventory` ya tiene `supplier_id`, `unit_of_measure`, `tax_rate`, `parent_sku`/`variant_label` (variantes modeladas como filas hijas del SKU base) y `suppliers` como tabla propia. Sigue siendo una tabla plana sin `products`/`product_variants` separados ni soporte de packs/servicios — el gap es real, pero parte más adelante de lo que decía la versión anterior de este documento.
4. **Caja auditable, pagos integrados y conciliación** — ⚠️ corregido 2026-08-14: `inventory-service` ya tiene `cash_sessions` (apertura/cierre con monto esperado vs. contado); lo que falta es el detalle de movimientos dentro de una sesión y la integración de pasarela de pago/conciliación con un adquirente externo, no el modelo de caja completo.
5. **Ventas documentales completas** (cotización, nota de venta, guía, factura, boleta, notas de crédito/débito, devoluciones, abonos) — hoy solo existen `orders` (pedido logístico) y `sales` (venta POS simple), sin relación entre documentos ni tipos documentales.
6. **Listas de precios, descuentos automáticos, cupones, fidelización** — `inventory.price` es un valor único, sin listas ni reglas.
7. **Ecommerce omnicanal** — no existe storefront ni `commerce-service`.
8. **App móvil de inventario tipo Tuin** — no existe; el Frontend actual es una sola PWA operativa por rol, no una app de conteo/escaneo offline-first separada.
9. **Permisos granulares, automatizaciones, API pública, webhooks** — hoy hay 7 roles fijos (`owner, ops, warehouse, shipper, vendor, support, customer`), no permisos por verbo/ámbito ni API pública versionada.
10. **Funciones sectoriales de Fudo** — explícitamente fuera del núcleo, ver §3.

## 5. Principio de diseño heredado que ya cumple Logify (y que no hay que romper)

El documento fuente insiste en varios controles no negociables que **Logify ya practica** en su núcleo actual y que la evolución debe preservar:

- **Idempotencia y compensación de Saga** — ya implementado en `orders-service` (confirmación de pedido con rollback de stock si `shipping-service` falla). El fiscal-service y payment-service nuevos deben seguir el mismo patrón, no uno distinto.
- **Verificación de dos factores en la entrega** (`client_code` + RUT) — es el diferenciador real de Logify frente a Bsale/Tuin/Fudo, ninguno de los tres lo tiene. No se toca.
- **Tenant derivado del JWT, nunca de un header** — ya es la regla en `shared/tenant`; todo módulo nuevo (fiscal, pagos, commerce) hereda esa regla sin excepción.
- **Stored procedures para operaciones atómicas con locking** (`fn_adjust_stock` con `SELECT FOR UPDATE`) — el kardex nuevo debe seguir este mismo patrón en vez de introducir un ORM o ejecutar `UPDATE stock` directo desde el código de aplicación.

## 6. Siguiente paso

Este documento fija el *por qué* y el *qué no*. El *cómo* y el orden de construcción quedan en [`EVOLUTION_ROADMAP.md`](../design-artifacts/EVOLUTION_ROADMAP.md). No se debe empezar a escribir código de ninguna fase sin que ese roadmap esté validado por el Product Owner, en particular la Fase P0 (base operativa) porque todo lo demás depende de ella.

⚠️ **Pendiente de validación humana antes de construir:**
- Confirmar que el mercado objetivo real de Logify es Chile continental (RUT + SII) y no expansión regional inmediata — condiciona si vale la pena diseñar el `FiscalProvider` para más de un país desde el día uno.
- Elegir proveedor DTE inicial (Bsale vs relBase) mediante el spike descrito en la fuente §26 antes de tocar código fiscal.
- Decidir presupuesto/tiempo disponible para volumen de trabajo: la fuente estima que la cadena `catálogo → stock → POS → pago → DTE → entrega → devolución → caja → reporte` completa (Fase P0 + venta fiscal mínima) es la unidad mínima que entrega valor competitivo — no son mejoras incrementales aisladas.
