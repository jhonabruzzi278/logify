# Plan funcional y técnico para evolucionar Logify a partir de Bsale, Tuin y Fudo

**Documento de producto, UX, frontend, backend y datos**  
**Fecha del análisis:** 14 de agosto de 2026  
**Sistema objetivo:** Logify — `github.com/jhonabruzzi278/logify`  
**Prioridad de referencia:** Bsale → Tuin → Fudo

---

## 1. Objetivo y alcance

Este documento convierte las interfaces y archivos entregados en un plan implementable para Logify. No propone copiar marcas, textos, diseño visual ni código de Bsale, Tuin o Fudo. Extrae patrones funcionales y los adapta a la arquitectura actual de Logify.

La revisión cubrió:

- 117 capturas de Bsale web.
- 17 capturas de Tuin móvil.
- 89 capturas de Fudo web.
- 1 imagen QR de tienda.
- 1 documento Word de 28 páginas con configuración y reportes.
- 1 PDF de 7 páginas con etiquetas de productos y códigos de barra.
- 2 archivos XLS de stock y detalle documental.
- 2 libros XLSX de estado de resultados e importación de productos.
- 3 CSV de zonas de despacho: país, regiones y 346 comunas.
- El repositorio público actual de Logify, incluyendo frontend, servicios, base de datos y documentación de arquitectura.

El resultado deseado no es una sola aplicación enorme. Logify debería convertirse en una plataforma compuesta por aplicaciones que comparten cuenta, catálogo, clientes, permisos y API:

1. **Logify Gestión:** administración, documentos, productos, inventario, clientes, compras, reportes y configuración.
2. **Logify POS:** venta rápida, caja, pagos, devoluciones e impresión.
3. **Logify Stock:** aplicación móvil/PWA inspirada en Tuin para conteos, escaneo y recepción.
4. **Logify Commerce:** tienda online, pedidos web, zonas, pagos y contenido.
5. **Logify Food, opcional:** extensión de restaurante inspirada en Fudo; no debe contaminar el núcleo generalista.

---

## 2. Conclusión ejecutiva

Logify ya tiene una base valiosa: React + TypeScript + Vite/PWA, diseño con Tailwind y componentes reutilizables, autenticación, multiempresa mediante `tenant_id`, POS, inventario, clientes, crédito, compras, proveedores, caja, pedidos, despachos, notificaciones, reportes y cuatro servicios Node/Express con PostgreSQL.

Por lo tanto, la estrategia correcta es **extender y normalizar**, no reescribir.

Los vacíos que impiden competir en el terreno principal de Bsale son, en orden:

1. Documentos tributarios electrónicos para Chile y ciclo completo SII.
2. Sucursales, bodegas, ubicaciones, stock por ubicación y kardex inmutable.
3. Modelo de catálogo más rico: producto, servicio, variante, pack, marca, tipo y atributos.
4. Caja auditable, pagos integrados y conciliación.
5. Ventas documentales: cotizaciones, notas de venta, guías, facturas, boletas, notas de crédito/débito, devoluciones y abonos.
6. Listas de precios, descuentos automáticos, cupones y fidelización.
7. Ecommerce omnicanal.
8. Aplicación móvil de inventario tipo Tuin.
9. Permisos granulares, automatizaciones, API pública, webhooks e integraciones.
10. Funciones sectoriales de Fudo como módulo opcional.

La prioridad máxima debe ser una cadena operativa completa y consistente:

`catálogo → stock → POS/pedido → pago → DTE → entrega → devolución → caja → reporte`.

No conviene construir primero un editor de tienda o funciones de restaurante mientras esa cadena aún tenga estados separados o actualizaciones manuales.

---

## 3. Estado actual de Logify y criterio de reutilización

### 3.1 Lo que ya existe

| Área | Evidencia actual en Logify | Decisión |
|---|---|---|
| Frontend | Páginas de dashboard, inventario, POS, pedidos, clientes, despachos, calendario, reportes, usuarios, proveedores, compras, configuración y facturación SaaS | Extender rutas y componentes existentes |
| POS | Escáner, buscador, extras, consulta de precio, apertura y cierre de caja | Mantener y separar motor de venta de la vista |
| Inventario | CRUD, detalle, ajuste, importación, plantilla, imagen, QR, PDF e indicadores | Migrar de cantidad global a stock por ubicación y movimientos |
| Ventas | Registro de venta y resumen de cierre | Convertir `sale` en proyección de un documento/orden pagada |
| Clientes | CRUD, validación de RUT, direcciones y movimientos de crédito | Ampliar a contactos, condiciones comerciales, cobranza y puntos |
| Compras y proveedores | CRUD de proveedores y registro de compras | Añadir orden, recepción parcial, costos e impuestos |
| Caja | Sesiones activas, historial y cierre | Añadir movimientos, arqueo por medio de pago y conciliación |
| Pedidos | Creación, confirmación, cancelación, asignación, PDF y seguimiento | Añadir documentos relacionados, reservas de stock y estados comerciales |
| Despachos | Etapas, QR, ruta, clima y validación de entrega | Reutilizar para guía de despacho y ecommerce |
| Notificaciones | Registros, alertas, push y suscripciones | Convertir en canal del motor de automatización |
| Seguridad | JWT, roles, invitaciones, recuperación y multiempresa | Pasar de roles fijos a permisos granulares con ámbito |
| SaaS | Plan, prueba, metadatos de tenant, cupones administrativos y página de billing | Completar suscripción, límites, cobro y portal de cuenta |

### 3.2 Problemas estructurales que deben resolverse antes de crecer

- Los archivos `src/index.js` concentran rutas, lógica y acceso a datos. Antes de agregar DTE o pagos, dividir cada servicio en `routes`, `application`, `domain`, `repositories`, `adapters` y `workers`.
- No usar `inventory.quantity` como única verdad. Toda entrada o salida debe crear un movimiento en un kardex y actualizar el saldo en la misma transacción.
- Toda operación distribuida debe usar **idempotencia** y **transactional outbox**. Reintentar un webhook o evento nunca puede duplicar una venta, un cobro, un DTE o un movimiento de stock.
- Un pedido, una venta, un pago, un DTE y un despacho son entidades relacionadas, no el mismo registro con estados mezclados.
- El frontend no debe decidir permisos solamente ocultando opciones; cada endpoint debe validar permiso, tenant, sucursal y bodega.
- Dinero y cantidades deben almacenarse como `numeric`, nunca como punto flotante. Guardar moneda, tasa y regla de redondeo utilizada.
- Fechas operativas deben registrar UTC y zona horaria del negocio. Para Chile, mostrar `America/Santiago`, pero no codificar offsets fijos.
- Secretos SII, certificados y credenciales de adquirentes deben cifrarse y nunca enviarse al navegador ni aparecer en logs, capturas o exportaciones.

### 3.3 Servicios objetivo

No es necesario crear un microservicio por pantalla. La distribución recomendada es:

- **orders-service:** pedidos, clientes, cotizaciones, ventas, devoluciones, crédito, promociones y fidelización.
- **inventory-service:** catálogo, variantes, sucursales, bodegas, kardex, recepciones, consumos, transferencias, compras, costos y etiquetas.
- **shipping-service:** entregas, guías relacionadas, zonas, tarifas, rutas, tracking y transportistas.
- **notification-service:** email, push, WhatsApp, plantillas y ejecución de automatizaciones.
- **fiscal-service nuevo:** folios, CAF, firma, DTE, envíos, respuestas SII, PDF tributario y auditoría.
- **payment-service nuevo:** intents, terminales, webhooks, reembolsos, comisiones y conciliación. Puede comenzar como módulo interno y separarse antes de producción.
- **commerce-service nuevo:** catálogo público, contenido, carrito, checkout, pedidos web, dominios y canales externos.
- **billing-service:** suscripciones de Logify, planes, límites y cobros del SaaS; puede comenzar dentro de orders-service pero separado del cobro de las ventas del comercio.

El Nginx/BFF actual debe seguir siendo la única entrada pública del panel. Las integraciones externas deben usar un gateway versionado: `/public-api/v1`.

---

## 4. Arquitectura funcional transversal

### 4.1 Identidad multiempresa y jerarquía operativa

Jerarquía propuesta:

`tenant → legal_entity → branch → warehouse → stock_location → register/device`.

- **Tenant:** cuenta SaaS de Logify.
- **Entidad legal:** RUT, razón social, giro, actividades, certificados y configuración tributaria. Un tenant podría administrar más de una empresa en el futuro.
- **Sucursal:** lugar comercial que vende, compra o entrega.
- **Bodega:** contenedor de inventario; puede estar asociada a una sucursal o ser solo logística.
- **Ubicación:** pasillo, estante o zona interna opcional.
- **Caja/dispositivo:** punto de venta físico con terminal, impresora y sesión.

Todas las tablas de negocio deben incluir `tenant_id`; las entidades operativas agregan `branch_id` y, si corresponde, `warehouse_id`. Las claves únicas deben ser compuestas por tenant: por ejemplo, `(tenant_id, sku)`.

### 4.2 Estados y auditoría

Cada entidad transaccional requiere:

- `status` validado mediante máquina de estados.
- `created_at`, `updated_at`, `created_by`, `updated_by`.
- historial de transiciones con autor, fecha, motivo y origen.
- `version` para control de concurrencia optimista.
- `idempotency_key` en comandos externos o sensibles.
- `source` (`pos`, `admin`, `mobile`, `ecommerce`, `api`, `integration`).
- papelera lógica para maestros; documentos emitidos no se eliminan.

Estados sugeridos:

- Pedido: `draft`, `reserved`, `confirmed`, `partially_fulfilled`, `fulfilled`, `cancelled`.
- Pago: `created`, `pending`, `authorized`, `captured`, `failed`, `cancelled`, `partially_refunded`, `refunded`.
- DTE: `draft`, `folio_reserved`, `signed`, `submitted`, `accepted`, `accepted_with_objection`, `rejected`, `voided`.
- Despacho: `pending`, `preparing`, `ready`, `assigned`, `in_transit`, `delivered`, `failed`, `cancelled`.
- Inventario físico: `draft`, `counting`, `submitted`, `reconciled`, `cancelled`.

### 4.3 Motor de documentos relacionados

Crear una entidad común `commercial_documents` y relaciones explícitas `document_references`.

Tipos iniciales:

- Cotización.
- Nota de venta.
- Pedido.
- Boleta y factura, afectas o exentas según configuración.
- Guía de despacho.
- Nota de crédito y nota de débito.
- Devolución operativa.
- Abono de cliente.
- Recepción de compra.

Un documento debe guardar una **instantánea** de emisor, receptor, dirección, líneas, impuestos, descuentos, precios y totales. Si luego cambia el cliente o producto, el documento histórico no cambia.

### 4.4 Motor de precios, impuestos y totales

Centralizar el cálculo en backend y compartir un paquete de tipos/reglas con frontend. Orden de cálculo configurable y probado:

1. precio de lista vigente;
2. cantidad y unidad de medida;
3. descuento de línea;
4. promociones automáticas compatibles;
5. cupón;
6. recargo o propina, si aplica;
7. neto/exento;
8. impuestos por línea;
9. redondeo;
10. total y saldo pagable.

La respuesta del backend debe incluir desglose completo y un `calculation_hash`. Al confirmar, el servidor recalcula y rechaza si los datos cambiaron.

### 4.5 Componentes de interfaz compartidos

Construir una biblioteca propia sobre los componentes UI existentes:

- `AppShell`, `WorkspaceSwitcher`, `BranchWarehouseSelector` y `ModuleNav`.
- `PageHeader`, `QuickActions`, `ContextHelp`, `TrialBanner` y `PermissionGate`.
- `FilterBar`, `SavedViewSelector`, `DateRangeCompare`, `SearchWithScanner` y `VoiceSearchButton`.
- `DataTable`, `ColumnManager`, `BulkActionBar`, `StatusBadge`, `MoneyCell`, `StockCell` y `RowMenu`.
- `EntityDrawer`, `ConfirmDialog`, `ReasonDialog`, `UnsavedChangesGuard` y `AuditTimeline`.
- `DocumentComposer`, `LineItemGrid`, `CustomerPicker`, `ProductPicker`, `TaxBreakdown`, `PaymentDrawer` y `DocumentPreview`.
- `FileImporter`, `ColumnMapper`, `ValidationResults`, `ImportProgress` y `ExportMenu`.
- `KpiTile`, `ChartPanel`, `ComparisonLegend`, `DrilldownTable` y `EmptyState`.
- `BarcodeScanner`, `QuantityStepper`, `CameraPermission`, `OfflineSyncBadge` y `ConflictResolver`.
- `ImageUploader`, `RichTextEditor`, `AddressEditor`, `ScheduleEditor` y `SecretField`.

Todos deben cubrir carga, vacío, error, sin permiso, modo offline cuando corresponda y uso por teclado/lector de códigos.

---

## 5. Hoja de ruta priorizada

| Fase | Resultado verificable | Dependencias |
|---|---|---|
| **P0. Base operativa** | Sucursales/bodegas, catálogo normalizado, kardex, permisos granulares, outbox e idempotencia | Migraciones y refactor de servicios |
| **P0. Venta fiscal mínima** | POS emite boleta/factura, cobra, descuenta stock, abre/cierra caja y consulta estado SII sin duplicaciones | Base operativa + fiscal + pagos |
| **P1. Ciclo Bsale completo** | Cotización, nota de venta, guía, devolución, nota de crédito/débito, abono, cobranza e impresión | Venta fiscal |
| **P1. Inventario y compras** | Recepciones, consumos, transferencias, inventarios físicos, costos, alertas y etiquetas | Kardex y bodegas |
| **P2. Comercial** | Listas de precios, promociones, cupones, puntos, clientes avanzados y dashboards | Motor de precios/documentos |
| **P2. Logify Stock** | PWA móvil de conteo y escaneo con funcionamiento offline | APIs de catálogo/kardex |
| **P3. Logify Commerce** | Tienda, checkout, pedido web, zonas, retiro/despacho, pagos y analítica | Catálogo, stock, precios y pagos |
| **P3. Plataforma** | API pública, webhooks, conectores, automatizaciones y WhatsApp | Outbox, permisos y auditoría |
| **P4. Logify Food** | Mesas, comandas, KDS, recetas, modificadores, propina y delivery gastronómico | Núcleo estable; feature flags |

Cada fase debe salir detrás de `feature_flags` por tenant. No activar DTE, pagos o migraciones de stock a todos los clientes al mismo tiempo.

---

## 6. Funcionalidades Bsale adaptadas a Logify — prioridad principal

### 6.1 Inicio, resumen y accesos rápidos

**Funcionalidad observada**

Panel con ventas, margen, ticket promedio, número de ventas, unidades vendidas, comparación contra periodo anterior, ventas por sucursal, productos más vendidos, formas de pago y pedidos web. Hay accesos rápidos por módulo y estados vacíos útiles.

**Frontend**

- Ruta `/dashboard` con selector de rango, comparación y sucursal.
- Tarjetas KPI clicables que abren el detalle filtrado.
- Gráfico temporal, distribución por sucursal, ranking de productos, medios de pago y pedidos web.
- Configurador de widgets por usuario.
- Mostrar hora de última actualización, moneda y alcance del dato.

**Componentes**

`DashboardToolbar`, `KpiTile`, `SalesTrendChart`, `BranchDonut`, `TopProducts`, `PaymentMethodChart`, `WebOrdersSummary`, `WidgetCatalog`, `WidgetGrid`.

**Backend y datos**

- Endpoints agregados: `GET /api/analytics/summary`, `/sales-trend`, `/branches`, `/products`, `/payments`, `/web-orders`.
- Parámetros comunes: `from`, `to`, `compare_from`, `compare_to`, `branch_ids`, `seller_ids`, `channel`.
- Crear vistas/materializaciones diarias, no calcular todo desde tablas crudas en cada carga.
- Definir margen como venta neta menos costo reconocido al vender; conservar el costo histórico de cada línea.

**Criterio de aceptación**

Los valores del panel deben cuadrar con el detalle exportado para el mismo filtro y declarar si incluyen documentos anulados, devoluciones e impuestos.

### 6.2 Catálogo: productos, servicios, variantes, tipos, marcas y packs

**Funcionalidad observada**

Bsale separa productos, servicios y packs; permite crear variantes, SKU y código de barras manuales o automáticos, precio con impuesto, costo, marca, tipo y atributos. Cada producto puede controlar stock, vender sin stock, admitir decimales, series o lotes. Los packs agrupan componentes y pueden imprimir su detalle.

**Modelo recomendado**

- `products`: nombre, naturaleza (`product`, `service`, `pack`), marca, tipo, descripción, estado, imagen.
- `product_variants`: SKU, barcode, nombre de variante, unidad, control de stock, venta sin stock, decimales, serial/lote.
- `brands`: nombre, imagen y estado.
- `product_types`, `attribute_definitions`, `attribute_options`, `variant_attribute_values`.
- `pack_components`: variante componente, cantidad, sustitución permitida y orden.
- `product_channels`: visibilidad, nombre y descripción por canal.
- `product_tax_rules`: impuesto por fecha y contexto.

Reutilizar `parent_sku`, `variant_label`, unidad, impuesto e imagen existentes durante la migración; crear identificadores internos UUID y dejar SKU como clave de negocio editable con historial.

**Frontend**

- `/catalog`: pestañas Todos, Productos, Servicios y Packs.
- Filtros por estado, marca, tipo, categoría, stock y canal.
- Editor por pasos: información → variantes → precio/impuestos → inventario → canales → revisión.
- Matriz de variantes creada desde atributos, con edición masiva de SKU, código, precio, costo y stock inicial.
- Pack builder con búsqueda, cantidades, subtotal de referencia y advertencia por componentes sin stock.
- Acciones masivas: activar/desactivar, etiquetas, exportar, asignar categoría, canal o lista.

**Componentes**

`CatalogTable`, `ProductTypeTabs`, `ProductWizard`, `VariantMatrix`, `SkuGenerator`, `BarcodeField`, `AttributeBuilder`, `StockPolicyFields`, `PackComposer`, `ChannelVisibility`, `BulkCatalogActions`.

**API mínima**

- `GET/POST /api/catalog/products`
- `GET/PATCH /api/catalog/products/:id`
- `POST /api/catalog/products/:id/variants`
- `POST /api/catalog/variants/:id/barcode`
- CRUD `/api/catalog/brands`, `/types`, `/attributes`, `/packs`
- `POST /api/catalog/imports` y `GET /api/catalog/imports/:id`

**Reglas críticas**

- SKU y barcode únicos por tenant cuando no estén vacíos.
- Un servicio no genera movimientos de stock.
- Un pack puede descontar componentes al vender o manejar stock propio, pero la política se define una vez y queda registrada en la línea vendida.
- Cambios de impuesto o unidad no alteran documentos históricos.
- Productos usados en documentos no se eliminan: se desactivan.

### 6.3 Sucursales, bodegas y stock por ubicación

**Funcionalidad observada**

Bsale muestra stock disponible, comprometido por despachar, total, por recibir, costo promedio y últimas entradas/salidas por sucursal. Permite sucursales comerciales o bodegas sin venta, con dirección, comuna, región, correo y coordenadas.

**Frontend**

- `/settings/branches` y `/settings/warehouses`.
- `/inventory/stock`: tabla variante × bodega con disponible, reservado, físico, en tránsito y costo.
- Selector global de sucursal/bodega conservado en la URL y sesión.
- Detalle con gráfico, movimientos, reservas, compras abiertas y transferencias.

**Modelo**

- `branches`, `warehouses`, `stock_locations`.
- `stock_balances(variant_id, warehouse_id, on_hand, reserved, incoming, available)`.
- `stock_movements`: tipo, cantidad firmada, costo unitario, referencia, lote/serie, usuario y saldo posterior.
- `stock_reservations`: origen, cantidad, vencimiento y estado.
- `inventory_transfers` y líneas con origen/destino/etapas.

`available = on_hand - reserved`; `incoming` nunca se suma a disponible hasta recibir.

**Tipos de movimiento**

`opening`, `purchase_receipt`, `sale`, `return_in`, `return_out`, `consumption`, `adjustment`, `transfer_out`, `transfer_in`, `count_reconciliation`, `production`, `pack_assembly`.

**API**

- `GET /api/stock?warehouse_id=&search=`
- `GET /api/stock/variants/:id/ledger`
- `POST /api/stock/adjustments`
- `POST /api/stock/reservations`
- `POST /api/stock/transfers`; acciones `dispatch`, `receive`, `cancel`
- `GET /api/stock/availability?variant_ids=&branch_id=`

**Reglas críticas**

- Bloqueo de fila o control optimista al confirmar movimientos.
- No editar ni borrar movimientos; corregir con contramovimiento y motivo.
- Transferir crea salida en origen y stock en tránsito; solo la recepción crea entrada en destino.
- Series no se repiten; lotes controlan cantidad y vencimiento.
- Cada operación sensible genera auditoría y evento.

### 6.4 Kardex, ajustes, consumos, recepciones y transferencias

**Funcionalidad observada**

Bsale ofrece ficha de stock, recepción con o sin documento proveedor, importación de líneas, consumo interno, actualización de costos/stock y alertas. El archivo `Stock.xls` exporta SKU, variante, stock, costo neto, serie, moneda y tipo de cambio.

**Pantallas**

- `Inventario > Movimientos`: kardex filtrable/exportable.
- `Inventario > Recepciones`: cabecera, proveedor/documento, bodega, productos, cantidades, costo e impuestos.
- `Inventario > Consumos`: motivo, nota y líneas; útil para mermas, muestras o uso interno.
- `Inventario > Ajustes`: valor esperado, contado, diferencia, costo y aprobación.
- `Inventario > Transferencias`: origen, destino, preparación, envío y recepción parcial.

**Componentes**

`StockLedgerTable`, `MovementTypeFilter`, `ReceiptComposer`, `SupplierDocumentFields`, `CostEditor`, `ConsumptionReason`, `AdjustmentGrid`, `TransferStepper`, `SerialLotCapture`, `BulkLineImporter`.

**Reglas**

- Recepción puede vincular factura, guía, compra u origen “sin documento”.
- El costo debe indicar si incluye impuesto; normalizar siempre a costo neto interno.
- Recepción parcial mantiene pendiente restante.
- Consumo siempre exige motivo; si la empresa lo configura, requiere aprobación.
- La actualización masiva de stock se convierte en ajustes individuales bajo un mismo lote, nunca en `UPDATE quantity` directo.
- Método de costo inicial recomendado: promedio ponderado por bodega. Guardar capas si luego se requiere FIFO.

### 6.5 Alertas de stock y reposición

**Funcionalidad observada**

Alertas por cantidad mínima o días de cobertura de ventas, configurables por producto y sucursal.

**Frontend**

- Política global con excepciones por variante/bodega.
- Bandeja de alertas con severidad, venta diaria, cobertura, pendiente por recibir y sugerencia.
- Acción “crear borrador de orden de compra”.

**Datos y cálculo**

- `reorder_policies`: `min_quantity`, `target_quantity`, `coverage_days`, `lead_time_days`, `safety_stock`.
- Consumo promedio configurable: 7/30/90 días, excluyendo anulaciones y corrigiendo quiebres si se dispone del dato.
- Sugerencia: demanda durante lead time + seguridad − disponible − entrante confirmado.

### 6.6 Etiquetas y códigos de barras

**Funcionalidad observada**

El generador permite seleccionar productos, formato PDF/CSV, plantilla y código —se observó CODE128—, cantidad fija o basada en stock/recepción, sucursal, variantes desactivadas, lista de precios, descuento y tipografía. Conserva historial de solicitudes. El PDF entregado contiene 7 páginas carta, 3 columnas de etiquetas, con nombre/variante, SKU, precio y barcode legible.

**Frontend**

- Asistente: selección → contenido → diseño → cantidades → vista previa → generar.
- Presets para carta y rollo térmico; medidas en mm, márgenes, separación, columnas y filas.
- Campos opcionales: nombre, variante, SKU, precio/lista, descuento, lote y vencimiento.
- Historial con usuario, fecha, parámetros, estado, PDF y regeneración.

**Backend**

- `label_templates`, `label_jobs`, `label_job_items`.
- Worker asíncrono genera PDF y CSV; almacenar hash de parámetros y archivo.
- Soportar inicialmente CODE128 y EAN-13 con validación; QR solo cuando tenga una URL o payload definido.
- Probar el barcode generado con decodificador automático y una página real impresa.

### 6.7 Importadores y exportadores

**Funcionalidad observada**

Bsale permite descargar plantilla, subir CSV/tabulado o pegar desde Excel. El archivo `DetalleDocumento.xls` usa: cantidad; barcode/SKU/serie; glosa; valor unitario; descuento porcentual; impuestos separados por `;`; costo neto de glosa. El producto no existente puede reemplazarse por una glosa.

**Flujo común**

1. Descargar plantilla versionada.
2. Subir archivo o pegar tabla.
3. Detectar encabezados/codificación/separador.
4. Mapear columnas si no coinciden.
5. Validar todas las filas sin modificar datos.
6. Mostrar errores por fila, advertencias y vista previa.
7. Confirmar; ejecutar job idempotente.
8. Entregar resumen y archivo de errores.

**Componentes**

`ImportDropzone`, `PasteGrid`, `ColumnMapper`, `ImportValidationTable`, `ErrorDownload`, `ImportJobProgress`, `ImportHistory`.

**Backend**

- `import_jobs`: tipo, versión, archivo, checksum, estado, contadores, autor.
- `import_errors`: fila, columna, código, mensaje y valor.
- Procesar en streaming y por lotes; límites por plan.
- Prevenir fórmulas peligrosas al exportar CSV ante valores que comiencen por `=`, `+`, `-` o `@`.

### 6.8 Editor unificado de documentos de venta

**Funcionalidad observada**

El editor busca productos/servicios, admite glosas, cantidades, precio, descuento y subtotal; selecciona cliente y tipo documental; calcula neto, impuesto y total. Los flujos incluyen boleta/factura manual, guía, cotización, nota de venta y documentos de devolución.

**Frontend**

- Ruta `/documents/new?type=` y edición de borradores.
- Cabecera: sucursal, emisor, vendedor, receptor, dirección, fecha, vencimiento, entrega y lista de precio.
- Grilla editable por teclado, lector o importador.
- Panel de totales y validaciones en tiempo real.
- Referencias a documentos anteriores.
- Guardar borrador, previsualizar, confirmar y enviar.
- Diseño responsive, pero no reducir la grilla a una tabla ilegible: en móvil usar tarjetas por línea.

**Componentes**

`DocumentTypePicker`, `IssuerBranchFields`, `CustomerPicker`, `DeliveryMode`, `PriceListPicker`, `LineItemGrid`, `ManualLineEditor`, `ReferenceDocuments`, `TotalsPanel`, `FiscalWarnings`, `DocumentActions`.

**Backend**

- `POST /api/documents/quotes`, `/sales-notes`, `/dispatch-guides`.
- `POST /api/documents/:id/confirm` con idempotency key.
- `POST /api/documents/:id/send-email`, `/print`, `/duplicate`.
- `GET /api/documents` con búsqueda por folio, receptor, estado, fecha, vendedor, sucursal y origen.
- Al confirmar: recalcular, reservar/descontar stock según política, registrar cuenta por cobrar/pago, emitir evento y solicitar DTE si aplica.

**Reglas**

- Diferenciar “constituye venta”, “reserva stock”, “mueve stock” y “es tributario”; son cuatro propiedades, no una sola.
- Entrega inmediata descuenta al confirmar; por despachar reserva y descuenta al preparar/despachar según política.
- Nunca reutilizar automáticamente folios/documentos anulados sin una regla fiscal validada.
- Toda referencia debe indicar tipo, folio, fecha, razón y relación.

### 6.9 Facturación y boleta electrónica SII — prioridad máxima

Esta funcionalidad requiere revisión tributaria y certificación antes de producción. La documentación oficial vigente del SII debe ser la fuente de verdad; las reglas no deben quedar codificadas desde capturas.

**Alcance inicial recomendado**

- Boleta electrónica afecta y exenta.
- Factura electrónica afecta y exenta.
- Nota de crédito y nota de débito.
- Guía de despacho electrónica.
- Consulta de envío y consulta de estado del documento.
- PDF/representación impresa, envío por email y almacenamiento del XML.
- Gestión de folios/CAF, certificado digital, ambientes certificación/producción y auditoría.

**Frontend**

- `Configuración > Tributación`: datos legales, actividades/giro, certificado, vencimiento, ambiente, tipos habilitados, folios y sucursal SII.
- Centro DTE con estados, filtros, reparos/rechazos, reintentos controlados, XML/PDF y referencias.
- Emisión dentro del POS/editor; el usuario no debe navegar a otra aplicación.
- Banner visible si certificado o folios están próximos a vencer/agotar.
- No mostrar la clave privada; carga con confirmación y prueba de firma.

**Componentes**

`TaxProfileForm`, `CertificateUploader`, `CertificateHealth`, `FolioRangeTable`, `DteStatusBadge`, `SiiSubmissionTimeline`, `RejectionDetails`, `DteXmlDownload`, `TaxDocumentPreview`.

**Modelo fiscal**

- `tax_profiles` por entidad legal.
- `digital_certificates`: metadata, contenido cifrado, huella, vigencia; contraseña en vault.
- `caf_ranges`: tipo DTE, desde/hasta, disponibles, estado y XML cifrado.
- `dtes`: snapshot, tipo, folio, XML original, XML firmado, track ID, estado y totales.
- `dte_submissions`, `dte_status_checks`, `dte_responses`, `dte_references`, `dte_audit_events`.
- Separar `business_status` de `sii_status`.

**Proceso**

1. Validar datos comerciales y tributarios.
2. Reservar folio de forma transaccional.
3. Construir XML conforme al esquema vigente.
4. Generar timbre y firma usando el certificado autorizado.
5. Validar localmente XML/schema y consistencia de totales.
6. Enviar al ambiente correspondiente.
7. Guardar respuesta y `track_id`.
8. Consultar estado mediante worker con backoff.
9. Actualizar estado y notificar reparo/rechazo.
10. Generar representación imprimible y enviar al receptor.

**Controles no negociables**

- El endpoint de emisión recibe `Idempotency-Key` y devuelve el mismo DTE ante reintentos.
- Un folio reservado no puede asignarse a dos documentos.
- XML firmado es inmutable y se conserva junto a respuestas.
- Firma y secretos solo en backend; cifrado en reposo y rotación de llaves.
- Reloj sincronizado, trazas correlacionadas y respaldo probado.
- Sets de prueba por tipo DTE y pruebas de rechazo, reparo, timeout y reenvío.
- No marcar “emitido/aceptado” solo porque el PDF se creó.

**Estrategia de entrega**

- Primera etapa: integrar un proveedor DTE certificado mediante un adaptador para salir antes y aprender el dominio.
- En paralelo: diseñar `FiscalProvider` para evitar acoplamiento.
- Segunda etapa opcional: motor propio SII, solo si volumen, costo y equipo justifican certificación y mantenimiento normativo.

Referencias oficiales a mantener enlazadas en el proyecto:

- Documentación técnica de Factura Electrónica: <https://www.sii.cl/factura_electronica/tecnica.htm>
- Instructivo técnico de Boleta Electrónica y API: <https://www.sii.cl/servicios_online/3532-instructivo_tecnico_be-3811.html>
- API oficial de Boleta Electrónica: <https://www4c.sii.cl/bolcoreinternetui/api/>
- Proceso de certificación de sistema propio/de mercado: <https://www.sii.cl/destacados/factura_electronica/factura_etapas_5.html>

### 6.10 POS, borradores y venta rápida

**Funcionalidad observada**

Catálogo buscable con productos destacados/más vendidos, carrito, cliente, documento, borradores, entrega y pago. La configuración incluye documento y medio por defecto, cambio rápido de vendedor, pantalla táctil, múltiples borradores, unión de borradores, preventa, propina y liberación al cerrar caja.

**Frontend**

- Mantener `/pos`, optimizado para 1024 px y táctil.
- Panel catálogo por categoría/favoritos; buscador con SKU/barcode/voz.
- Carrito con cantidades, descuentos autorizados, notas y disponibilidad.
- Barra persistente: cliente, vendedor, lista, documento, entrega y total.
- Borradores nombrables, recuperables y opcionalmente combinables.
- Modo offline limitado: catálogo/precios cacheados y cola cifrada; no prometer DTE aceptado ni cobro integrado mientras no haya red.

**Componentes**

`PosProductGrid`, `PosSearch`, `CartLine`, `CustomerQuickCreate`, `SellerSwitcher`, `DraftTabs`, `DeliveryToggle`, `PriceOverrideDialog`, `CheckoutButton`, `OfflineQueue`.

**Backend**

- `pos_drafts` y `pos_draft_lines` con expiración y versión.
- `POST /api/pos/quotes` para cálculo; `POST /api/pos/checkout` orquesta venta, pagos, stock y documento.
- El checkout devuelve un `operation_id` consultable para procesos asíncronos.
- Si falla después del cobro, activar compensación y una bandeja de operaciones pendientes; nunca ocultar la inconsistencia.

### 6.11 Cobro, medios de pago y terminales integrados

**Funcionalidad observada**

Bsale configura efectivo, crédito, cheque, transferencia, Webpay y distintos POS integrados; el checkout permite más de una forma, monto pagado y vuelto. Se observan dispositivos asociados a sucursal/caja y autenticación de Mercado Pago.

**Frontend**

- Drawer de pago con total, método, monto, cuotas/referencia, vuelto y múltiples medios.
- Estado en vivo de terminal: esperando, procesando, aprobada, rechazada, cancelada o incierta.
- Configuración por proveedor: conexión OAuth/credenciales, sucursal externa, caja externa, terminal y prueba.
- Centro de conciliación: ventas Logify vs transacciones adquirente, diferencias y resolución.

**Modelo**

- `payment_methods`, `payment_providers`, `payment_connections`, `payment_devices`.
- `payment_intents`, `payment_transactions`, `payment_allocations`, `refunds`, `provider_webhooks`, `settlements`, `reconciliation_items`.
- Separar medio contable de proveedor técnico: “tarjeta débito” puede procesarse por más de un adquirente.

**API**

- `POST /api/payments/intents`, `GET /api/payments/intents/:id`.
- Acciones `cancel`, `capture`, `refund` según proveedor.
- `POST /webhooks/payments/:provider` con verificación de firma y deduplicación.
- `POST /api/payment-connections/:id/test`.
- `GET /api/reconciliation` y acciones de resolución auditadas.

**Reglas**

- Crear intent con `external_reference` estable; webhook es la fuente de actualización, no una redirección del navegador.
- No guardar PAN/CVV.
- Credenciales privadas en backend/vault.
- Si la respuesta es incierta, consultar antes de reintentar para evitar doble cobro.
- Reembolso se vincula a pago, devolución y nota de crédito, pero sus estados pueden avanzar por separado.
- Para integraciones en nombre de clientes, usar OAuth cuando el proveedor lo admita.

Mercado Pago Point actualmente documenta un flujo de sucursal + caja + terminal, creación de orden, notificaciones y conciliación; referencia oficial: <https://www.mercadopago.cl/developers/es/docs/mp-point/overview>.

### 6.12 Caja, arqueos, movimientos y cierres

**Funcionalidad observada**

Apertura/cierre, reimpresión, depósitos de cliente, movimientos de caja, resumen teórico vs real, diferencia, documentos por medio de pago, impresión y exportación. Configuración por emisor o sucursal, varios cierres diarios y cierres que abarcan más de un día.

**Frontend**

- Apertura con monto inicial y desglose opcional.
- Ingreso/egreso con categoría, monto, método, nota y comprobante.
- Arqueo ciego opcional: operador cuenta antes de ver el teórico.
- Cierre por método: esperado, contado, diferencia y justificación.
- Supervisor aprueba diferencias sobre umbral.

**Modelo y reglas**

- Ampliar `cash_sessions` con caja, sucursal, responsable y alcance temporal.
- `cash_movements`: apertura, venta, ingreso, egreso, devolución, retiro, depósito y ajuste.
- `cash_counts` y denominaciones opcionales.
- Ventas y reembolsos generan movimientos automáticamente.
- Cerrar bloquea nuevos movimientos en esa sesión; una corrección posterior pertenece a otra sesión y referencia la anterior.
- Totales de caja deben provenir de movimientos/pagos, no de un campo editable.

### 6.13 Devoluciones, anulaciones, notas de crédito y débito

**Funcionalidad observada**

Devolución por producto/servicio o ajuste de texto; nota de crédito/débito que puede o no afectar stock; referencias; límites de tiempo configurables.

**Frontend**

- Buscar documento original; seleccionar líneas y cantidades.
- Elegir resolución: reintegro, crédito cliente, cambio o sin devolución monetaria.
- Indicar retorno de stock, bodega, condición y motivo.
- Vista previa de documento tributario asociado.

**Modelo**

- `returns`, `return_lines`, `return_reasons`, `refunds`, `document_references`.
- Cantidad devuelta acumulada no supera cantidad elegible, salvo permiso/excepción auditable.

**Reglas**

- Anulación no equivale a borrar.
- Stock, pago y DTE son efectos explícitos y compensables.
- Nota de crédito debe referenciar el documento según el caso y conservar razón.
- Un artículo dañado puede entrar a cuarentena, no necesariamente a disponible.
- Límites temporales se evalúan por política y permiso; lo tributario se valida por reglas vigentes.

### 6.14 Clientes, contactos, direcciones y condiciones comerciales

**Funcionalidad observada**

Persona/empresa, nacional/extranjero, RUT, razón social/nombres, giro, múltiples correos, teléfonos, notas, redes, varias direcciones y contactos. Condiciones: crédito, lista de precios y forma de pago predeterminada. Atributos personalizados con tipo, ayuda, longitud y obligatoriedad.

**Frontend**

- Lista, filtros, exportación, estado y crédito disponible.
- Perfil 360°: resumen, ventas, documentos, pagos, crédito, puntos, direcciones, contactos y actividad.
- Creación rápida desde POS y completa desde administración.
- Acciones: editar, desactivar, bloquear venta, cambiar condición y anonimizar cuando legalmente corresponda.

**Modelo**

- Extender `customers`; agregar `customer_contacts`, `customer_addresses`, `customer_tags`, `customer_notes`.
- `custom_field_definitions` y `custom_field_values`, con validación por tipo.
- `customer_commercial_terms`: lista, método, límite, días, bloqueo y vendedor.
- Normalizar RUT para búsqueda y conservar representación formateada.

**Reglas**

- Cliente usado en documentos se desactiva, no se elimina físicamente.
- El documento conserva snapshot de receptor y dirección.
- Bloqueo por deuda debe avisar motivo y permitir override solo a permiso superior.
- Deduplicación asistida por RUT/email/teléfono con combinación auditable.

### 6.15 Crédito, cobranza y abonos

**Funcionalidad observada**

Panel de crédito pendiente/pagado, vencido, clientes, antigüedad de deuda, vendedores, avance de cobranza, facturas pendientes/pagadas, depósitos y recordatorios.

**Frontend**

- Dashboard de cartera con aging: vigente, 1–30, 31–60, 61–90 y 90+.
- Cuenta corriente por cliente con cargos, pagos, notas y saldo.
- Aplicación de un pago a uno o varios documentos; pago parcial y saldo a favor.
- Recordatorios individuales y masivos con plantilla.

**Modelo**

- Reutilizar `customer_credit_movements`, migrándolo a libro mayor de doble referencia.
- `accounts_receivable`, `receivable_allocations`, `customer_deposits`, `collection_actions`.
- Límite usado = documentos abiertos + pedidos reservados configurados − saldo a favor.

**Reglas**

- Un pago no modifica el total del documento: crea una asignación.
- Desasignar exige permiso y auditoría.
- El saldo debe poder reconstruirse desde movimientos.

### 6.16 Listas de precios, descuentos automáticos y cupones

**Funcionalidad observada**

Descuentos por cantidad con progresión porcentual, restricciones por lista y fechas; descuento por diferencia entre listas. Cupones con código, porcentaje o monto, mínimo, máximo, vencimiento, cantidad de usos y reglas de acumulación.

**Modelo**

- `price_lists`, `price_list_items`, `price_rules` con vigencia y moneda.
- `promotions`, `promotion_conditions`, `promotion_actions`, `promotion_scopes`.
- `coupons`, `coupon_redemptions`, `promotion_exclusions`.

**Frontend**

- Editor guiado “cuando… entonces…” con resumen humano.
- Simulador con cliente, sucursal, canal, fecha y carrito.
- Prioridad, exclusividad y reglas de combinación visibles.

**Reglas**

- Evaluación determinista en backend.
- Reservar/redimir cupón de forma atómica.
- Guardar promoción aplicada y desglose en la línea.
- No recalcular históricos al editar una promoción.
- Conflictos resueltos por prioridad y grupo de exclusión, no por orden accidental en base de datos.

### 6.17 Fidelización y puntos

**Funcionalidad observada**

Nombre del programa, enrolamiento automático, equivalencia moneda/puntos, topes por venta/cliente, vencimiento, mínimo de canje, valor del punto y reglas sobre descuentos/glosas.

**Modelo**

- `loyalty_programs`, `loyalty_accounts`, `loyalty_ledger`, `loyalty_rules`, `loyalty_expiration_batches`.
- Libro de puntos inmutable: `earn`, `redeem`, `expire`, `reverse`, `adjust`.

**Frontend**

- Configuración y simulador.
- Saldo en perfil y POS.
- Drawer de canje con saldo, mínimo, máximo y efecto sobre total.
- Historial y próximas expiraciones.

**Reglas**

- Acreditar al estado comercial definido, idealmente venta pagada/aceptada.
- Una devolución revierte proporcionalmente.
- Canje y emisión deben ser atómicos.
- Jobs de expiración idempotentes y notificables.

### 6.18 Compras, proveedores y reposición

**Funcionalidad objetivo derivada de Bsale y del Logify actual**

Logify ya registra compras/proveedores; debe evolucionar a un ciclo con solicitud, orden, recepción y cuenta por pagar. Las recepciones observadas permiten indicar factura, guía, documento interno o ningún documento, número, impuesto incluido en costo, nota, cantidades, costos e importación.

**Frontend**

- `/purchases/orders`: borradores, enviadas, parcialmente recibidas, recibidas, cerradas y canceladas.
- Editor con proveedor, sucursal/bodega, fechas, moneda, términos, líneas, costos, impuestos y adjuntos.
- Comparación ordenado vs recibido vs facturado.
- Sugerencias de reposición convertibles en borrador y agrupadas por proveedor.

**Modelo**

- Extender `purchases` o migrar a `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `supplier_documents`, `supplier_price_history`.
- Capturar moneda y tipo de cambio del archivo de stock cuando corresponda.
- Guardar costos adicionales distribuibles: flete, seguro, aduana y otros.

**Reglas**

- Orden no mueve stock; recepción sí.
- Costo promedio se actualiza al recibir y conserva evidencia.
- Recepción parcial no cierra líneas pendientes.
- Diferencias de cantidad/costo sobre tolerancia requieren aprobación.
- Proveedor desactivado conserva historial.

### 6.19 Reportes y analítica

**Funcionalidad observada**

Bsale muestra ventas, margen, ticket, unidades, sucursal, producto, pago, devoluciones, cobranza y pedidos web. El Word agrega detalle de ventas, ventas por día/hora/origen/canal, ranking de vendedores, cancelaciones, inventario, consumo, desperdicios, gastos y proveedores. El XLSX `Estado_de_resultados.xlsx` organiza por mes y total: ventas brutas, descuentos, impuestos, ventas netas, costo de mercadería, impuestos de compra, ganancia bruta, gastos operativos/administrativos, comisiones e impuestos de gastos.

**Catálogo de reportes Logify**

1. Resumen ejecutivo.
2. Detalle de ventas y documentos.
3. Ventas por producto, categoría, vendedor, hora, día, sucursal, canal y origen.
4. Margen y rentabilidad; costo de mercadería vendida.
5. Métodos de pago, comisiones, devoluciones y conciliación.
6. Stock actual, valorización, kardex, cobertura, rotación, quiebres e inventarios.
7. Compras, recepciones y ranking de proveedores.
8. Crédito, aging y cobranza.
9. Despachos, tiempos, cumplimiento y costo por zona/transportista.
10. Estado de resultados por periodo, sucursal y centro de costo.
11. Auditoría: anulaciones, overrides, diferencias de caja y acciones sensibles.

**Frontend**

- Filtros persistentes y compartibles en URL.
- Gráfico y tabla para cada análisis; drilldown hasta documento/línea.
- Columnas configurables, exportación CSV/XLSX/PDF y reportes programados.
- Definición visible de cada KPI mediante tooltip.

**Backend**

- Eventos de negocio alimentan tablas analíticas; agregar vistas diarias por tenant/sucursal.
- Un endpoint de exportación crea job y archivo descargable.
- Registrar zona horaria y corte de día comercial.
- Pruebas de reconciliación: cada total debe cuadrar con el libro transaccional.

### 6.20 Ecommerce y administración de tienda

**Funcionalidad observada**

Bsale ofrece plantillas visuales, descripciones web, colecciones, pedidos, cupones, descuentos y un editor de diseño con componentes, archivos, sliders, imágenes, formularios, artículos y navegación. Configura identidad, dominio, logo/favicon, contacto, redes, analítica, precio, paginación, búsqueda, relacionados, stock inteligente, retiro/despacho, sucursales y gateways.

**Alcance MVP de Logify Commerce**

- Catálogo público responsive, búsqueda, categorías/colecciones y detalle.
- Carrito persistente y checkout como invitado o cliente.
- Disponibilidad por sucursal; retiro o despacho.
- Zonas/tarifas, dirección, horario y promesa de entrega.
- Pago online y transferencia con verificación.
- Pedido web conectado a stock, cliente, pago, DTE y despacho.
- Emails/push de confirmación y cambios.
- SEO básico, dominio, redes, GA4/GTM/Pixel con consentimiento.

**Frontend administrador**

- `/commerce/overview`, `/orders`, `/catalog`, `/collections`, `/content`, `/design`, `/settings`, `/integrations`.
- Checklist de publicación: identidad, productos, stock, pago, entrega, dominio y prueba.
- Editor por secciones con componentes limitados y seguros, no HTML arbitrario.
- Vista previa escritorio/móvil y estados borrador/publicado.

**Storefront**

- Componentes: `StoreHeader`, `Navigation`, `HeroSlider`, `CollectionGrid`, `ProductCard`, `ProductGallery`, `VariantSelector`, `AvailabilityMessage`, `CartDrawer`, `CheckoutStepper`, `PickupSelector`, `DeliveryQuote`, `PaymentOption`, `OrderTracking`.
- Accesibilidad, Core Web Vitals, imágenes adaptativas y metadatos estructurados.

**Modelo/backend**

- `sales_channels`, `storefronts`, `themes`, `content_pages`, `content_blocks`, `menus`, `collections`, `collection_products`, `domains`.
- `carts`, `cart_lines`, `checkout_sessions`, `web_orders` o `orders.source='ecommerce'`.
- Publicación crea una versión inmutable y purga caché/CDN.
- El storefront consume solo APIs públicas acotadas, nunca endpoints administrativos.
- Reservar stock durante checkout con expiración; liberar por timeout/fallo.

**Configuraciones observadas que deben contemplarse**

- Sitio en construcción y acceso con login.
- Orden y cantidad de productos por página.
- Precio/lista por defecto y descuento visible.
- Productos relacionados automáticos/manuales.
- Ocultar sin stock o permitir preventa.
- Una o varias sucursales de retiro/despacho.
- Cookies y scripts de analítica bajo consentimiento.
- Gateways mediante adaptadores, secretos cifrados y webhooks.

### 6.21 Zonas y tarifas de despacho

**Estructura documental revisada**

Los tres CSV usan identificadores internos que no deben borrarse y una jerarquía progresiva:

- País: 1 fila de Chile.
- Región: 16 regiones.
- Comuna: 346 filas de comunas.
- Columnas de precio configurables por rango, por ejemplo `0 a 3`, `3 a 6`, `6 a 9`, más incrementos como `1+` o `5+`.

**Implementación**

- `shipping_zones` jerárquicas con país, región, comuna, polígono o códigos postales.
- `shipping_rate_tables` y `shipping_rate_tiers`: desde/hasta, unidad (`kg`, volumen, subtotal), base e incremento.
- Importador/exportador conserva `external_id` y valida solapamientos, huecos y valores negativos.
- Cotizador recibe dirección normalizada, carrito, peso/volumen, subtotal y fecha.
- Mostrar por qué una tarifa fue elegida y guardar snapshot en el pedido.
- Permitir tarifa fija, gratis sobre mínimo, retiro, proveedor externo y no disponible.

### 6.22 Pedidos web, preparación y despacho

**Frontend**

- Bandeja por estado con SLA: nuevo, confirmado, preparando, listo, despachado/retirado, entregado, cancelado.
- Vista de pedido con pago, DTE, stock, preparación, dirección, transportista y timeline.
- Picking list, packing, etiqueta/QR y confirmación de entrega.

**Integración con Logify existente**

- Reutilizar `orders-service` y `shipping-service`.
- Añadir `channel`, `fulfillment_type`, `promised_at`, `warehouse_id`, `payment_status`, `fiscal_status`.
- El QR y seguimiento existentes se convierten en capacidades transversales.
- La ruta/clima son complementos, no deben bloquear el flujo principal.

### 6.23 Integraciones, marketplace, API pública y webhooks

**Funcionalidad observada**

Marketplace con logística, marketplaces, CRM, reseñas, búsqueda, delivery, Google Shopping, Mercado Libre y herramientas de marketing.

**Centro de integraciones**

- Catálogo con logo, categoría, descripción, permisos solicitados, precio y estado.
- Instalar → autenticar → mapear → sincronización inicial → monitorear → desconectar.
- Log de sincronización con errores reintentables y acciones correctivas.

**Plataforma técnica**

- `integration_connections`, `integration_mappings`, `sync_jobs`, `sync_cursors`, `webhook_subscriptions`, `webhook_deliveries`.
- API `/public-api/v1` con OAuth2/API keys por scopes, rate limit, paginación, versionado y audit log.
- Eventos iniciales: `product.updated`, `stock.changed`, `order.created`, `order.updated`, `payment.updated`, `dte.updated`, `shipment.updated`, `customer.updated`.
- Firmar webhooks, reintentar con backoff, deduplicar y ofrecer replay.
- Nunca hacer llamadas a terceros dentro de la transacción principal.

**Conectores priorizados**

1. Proveedor DTE/SII.
2. Mercado Pago Point y pagos online; luego Transbank/Webpay/POS según viabilidad técnica/comercial.
3. WhatsApp Business.
4. Shopify/WooCommerce o exportador de catálogo, según clientes reales.
5. Transportistas y delivery.
6. Loyverse como importación/sincronización transitoria, no como dependencia del modelo interno.

### 6.24 Automatizaciones y notificaciones

**Funcionalidad observada**

Notificaciones por primera compra, compra sobre mínimo, recordatorio de puntos y plantillas; soporte de email. La solicitud adjunta también prioriza WhatsApp y automatización.

**Diseño**

- Constructor: **evento → condiciones → espera opcional → acción**.
- Eventos de dominio, no consultas periódicas por pantalla.
- Acciones: email, push, WhatsApp, webhook, crear tarea, cambiar etiqueta o notificar a rol.
- Plantillas versionadas con variables verificadas y vista previa.
- Preferencias/consentimiento por cliente y canal.

**Modelo**

- `automation_rules`, `automation_versions`, `automation_runs`, `automation_steps`, `message_templates`, `contact_preferences`.
- Una clave única por regla + evento evita ejecuciones duplicadas.
- Bandeja de fallos con reintento y detalle sin exponer secretos.

**Automatizaciones iniciales**

- Stock bajo y quiebre.
- Certificado/folios próximos a vencer/agotar.
- Pago o DTE rechazado.
- Pedido web nuevo o atrasado.
- Cobranza antes/después de vencimiento.
- Primera compra, cliente inactivo, puntos por vencer.
- Despacho fuera de SLA.

### 6.25 Configuración general del negocio

**Opciones observadas que deben organizarse, no acumularse en una lista única**

- Moneda, decimales, zona horaria e inicio de semana.
- Clasificación producto/servicio y control de stock.
- Glosas manuales.
- Documento, forma de pago y tipo de entrega predeterminados.
- Plazos de anulación/devolución.
- Reserva de stock por documentos no venta.
- referencias documentales y códigos de barras compuestos.
- Impresión de borrador, descuentos y más vendidos.
- Múltiples borradores, preventa, pantalla táctil y propina.
- Cierre por emisor/sucursal, múltiples cierres y periodos.
- Enlace contable y sucursal de integración.

**Frontend**

Separar rutas: `/settings/business`, `/tax`, `/sales`, `/pos`, `/inventory`, `/documents`, `/branches`, `/payments`, `/printing`, `/integrations`, `/notifications`, `/security`.

Cada control debe incluir explicación, valor por defecto, impacto y, si cambia reglas futuras solamente, indicarlo. Configuraciones sensibles requieren confirmación y registro de auditoría.

### 6.26 Impuestos, documentos y medios de pago maestros

**Funcionalidad observada**

CRUD de impuestos con nombre, tasa, código DTE y aplicación automática; tipos documentales y métodos de pago configurables.

**Implementación**

- `tax_codes` mantenidos por plataforma y `tenant_tax_rules` configurables con vigencia.
- `document_type_configs`: habilitado, secuencia, afecta venta/stock/caja, requiere cliente y proveedor fiscal.
- `payment_method_configs`: nombre visible, tipo contable, proveedor, requiere referencia, entrega vuelto y habilitación por canal/sucursal.
- No permitir que el tenant invente un código fiscal externo; debe elegir de catálogo validado.
- Cambios con vigencia futura, nunca reescritura histórica.

### 6.27 Usuarios, perfiles y permisos granulares

**Funcionalidad observada**

Usuarios por email, perfiles y permisos agrupados por maestros, reportes, operaciones, API y otros; restricciones por documento, despacho y lista de precio.

**Modelo**

- `roles`, `permissions`, `role_permissions`, `user_roles`, `user_scopes`.
- Ámbitos: tenant, entidad legal, sucursal, bodega y caja.
- Permisos verbales: `catalog.read`, `catalog.manage`, `stock.adjust`, `sale.discount.override`, `cash.close`, `dte.issue`, `dte.retry`, `reports.margin.read`, `integrations.manage`, etc.

**Frontend**

- Matriz de permisos con plantillas de rol.
- Resumen de acceso efectivo por usuario.
- Invitación, suspensión, sesiones activas y revocación.
- En operaciones críticas, pedir motivo y eventualmente reautenticación.

### 6.28 Impresión y documentos operativos

**Funcionalidad observada**

Reimpresión de boletas/ventas, despacho, devolución, abono, movimiento, cierre, recepción y reportes. Fudo aporta configuración detallada de tamaño, encabezado/pie, logo, moneda, ID, grupos sin precio y prueba de impresión.

**Implementación**

- `print_templates` por tipo, sucursal, caja y tamaño: 58/80 mm, carta y etiqueta.
- `print_jobs` con estado y reintento.
- Vista previa PDF/HTML y prueba de impresión.
- Aplicación/agente local opcional para impresoras térmicas y cajón de dinero; el navegador no debe fingir control confiable de hardware.
- Plantilla versionada; una reimpresión de documento histórico usa sus datos originales y marca “copia” si corresponde.

### 6.29 Soporte, ayuda y onboarding

**Funcionalidad observada**

Ticket con correo, asunto, editor, RUT, adjuntos y captcha; base de conocimiento por administración, clientes, crédito, stock, ventas, ecommerce, productos, documentos, POS y SII. También hay checklist de puesta en marcha.

**Implementación**

- Centro de ayuda contextual por ruta.
- Formulario que adjunta versión, tenant, navegador, correlation ID y logs técnicos consentidos; nunca secretos.
- Checklist por tipo de negocio: datos, catálogo, sucursal, usuarios, caja, pagos, tributación y venta de prueba.
- Estado de ticket y conversación si se implementa soporte interno; alternativamente conectar una mesa de ayuda.

### 6.30 Cuenta, planes, licencias y facturación SaaS

**Funcionalidad observada**

Cuenta inactiva, contratación/activación, cambio de plan, servicios adicionales, referidos y cancelación.

**Implementación**

- Planes con límites medibles: usuarios, sucursales, DTE, pedidos, almacenamiento, automatizaciones e integraciones.
- Entitlements calculados en backend y expuestos al frontend.
- Trial, suscripción, factura/recibo, método de cobro, renovación, mora, gracia, downgrade y cancelación.
- Portal de cuenta separado de la caja/pagos de los clientes del comercio.
- Nunca borrar datos automáticamente al cancelar; definir retención, exportación y fecha de eliminación visible.
- Medición idempotente y auditable para no facturar dos veces.

---

## 7. Logify Stock — aplicación móvil inspirada en Tuin

La aplicación debe construirse como PWA instalable dentro del monorepo actual antes de considerar una app nativa. Compartirá API, autenticación, componentes y tipos, pero tendrá navegación y almacenamiento offline propios.

### 7.1 Inicio móvil

**Interfaz observada**

Inicio con accesos a Productos, Crear producto, Historial de inventarios y Crear inventario; conteo total/progreso, notificaciones, ayuda y cuenta.

**Componentes**

`MobileHome`, `QuickActionTile`, `ActiveCountCard`, `SyncStatus`, `MobileNotifications`, `BottomNavigation`.

### 7.2 Lista e historial de inventarios

- Filtros: todos, borrador, eliminados/cancelados y finalizados.
- Búsqueda textual/voz y botón flotante de creación.
- Tarjeta con nombre, bodega, fecha, progreso, autor y estado.
- Continuar, renombrar, compartir, exportar o cancelar según estado.
- Regla observada: un inventario activo a la vez. En Logify hacerla configurable por bodega; siempre impedir dos conteos activos sobre el mismo alcance.

### 7.3 Creación y alcance de inventario

- Elegir bodega/ubicación, nombre, alcance total o subconjunto, categorías/productos y modo ciego.
- Congelar una instantánea de stock teórico al comenzar.
- Permitir recuento y aprobación si la diferencia supera tolerancia.
- Estados `draft → counting → submitted → reconciled`; cancelar no borra capturas.

### 7.4 Escaneo de barcode

**Interfaz observada**

Cámara a pantalla completa, marco de enfoque, linterna, zoom y galería; al detectar abre producto.

**Implementación**

- `CameraScanner`, `TorchToggle`, `ZoomControl`, `ManualCodeInput`, `ScanFeedback`.
- Soportar cámara y lector Bluetooth/USB que actúa como teclado.
- Resolver múltiples coincidencias y códigos desconocidos; ofrecer creación solo a usuarios autorizados.
- Vibración/sonido configurables, debounce y protección contra lectura duplicada.

### 7.5 Conteo

- Mostrar nombre, variante, SKU/código y cantidad capturada.
- Stepper `−/+`, entrada directa y unidad; para decimales respetar precisión.
- Series/lotes requieren captura individual o cantidad por lote.
- Modo ciego oculta stock teórico; modo guiado lo muestra.
- Guardado local inmediato y sincronización en segundo plano.

**Datos offline**

- IndexedDB cifrada cuando sea viable, con catálogo mínimo, sesión, líneas y cola.
- Cada cambio lleva `client_operation_id`, versión y timestamp.
- El backend deduplica y devuelve conflictos; no usar “último cambio gana” silenciosamente.

### 7.6 Finalización y conciliación

**Interfaz observada**

Resumen de inventario inicial vs contado, diferencia, confirmación, pantalla de término y compartir/exportar CSV.

**Flujo Logify**

- Resumen por producto y valor, faltantes/sobrantes y productos no contados.
- Confirmación con motivo general.
- Si exige aprobación, enviar a supervisor.
- Reconciliar genera un lote de movimientos de ajuste.
- Exportar CSV/PDF con conteo, teórico, diferencia, costo, usuario y horas.

### 7.7 Productos móviles

- Lista con recientes/favoritos, stock, filtros y búsqueda/voz.
- Creación rápida escaneando o manualmente.
- Campos mínimos: nombre, tipo, SKU/barcode automático si se omite, unidad, categoría y política de stock.
- Los campos fiscales/precios avanzados pueden quedar pendientes de completar en Gestión; mostrar estado “incompleto”.

### 7.8 Cuenta y preferencias

- Perfil personal, empresa/sucursal/bodega activa, preferencias, ayuda, términos, versión y cerrar sesión.
- Bloqueo biométrico opcional sin sustituir la autenticación del servidor.
- Mostrar última sincronización, cola y opción segura de reintento.

---

## 8. Funcionalidades Fudo — módulo secundario y opcional

Fudo está orientado a restaurantes. Sus capacidades generalizables deben incorporarse al núcleo cuando sirven a cualquier comercio; el resto debe vivir bajo `food_module` y feature flags.

### 8.1 Lo que sí debe ir al núcleo general

- Gastos, categorías financieras y estado de resultados.
- Turnos y cierres de caja avanzados.
- Propinas como distribución separada del ingreso.
- Preparación/fulfillment con estados y tiempos.
- Zonas, tarifas y delivery.
- Campañas, cupones, CRM y WhatsApp.
- Impresoras, áreas de impresión y pruebas.
- Productos compuestos/recetas como evolución de packs o BOM.

### 8.2 Salones, mesas y mapa

**Frontend Food**

- `/food/floors`: editor de salones/terraza, mesas, forma, capacidad, posición y agrupación.
- `/food/service`: mapa en vivo con estados libre, ocupada, cuenta solicitada, retrasada y reservada.
- Abrir mesa, asignar garzón/comensales, mover/unir/dividir mesa y transferir productos.

**Modelo**

- `dining_areas`, `tables`, `table_sessions`, `covers`, `table_transfers`.
- Una mesa puede tener una sesión activa; la venta se vincula a sesión, no a la mesa histórica.

### 8.3 Toma de pedidos gastronómicos

- Categorías/favoritos, productos grandes táctiles, buscador y carrito por comensal.
- Cursos/tiempos, notas de preparación, cantidades y modificadores obligatorios.
- Acciones enviar a cocina, guardar, cobrar parcial/dividido y cerrar.
- Canales mostrados: salón, mostrador, express, delivery, retiro y reserva.

Componentes: `FoodProductGrid`, `GuestTabs`, `CourseSelector`, `ModifierDialog`, `KitchenSendButton`, `SplitBill`, `TipSelector`.

### 8.4 Ingredientes, recetas, subrecetas y modificadores

El XLSX de Fudo define:

- Productos: categoría, subcategoría, código, nombre, descripción, precio, costo, proveedor, activo, favorito, controlar stock, venta individual, posición, tienda online, menú QR y venta sin stock.
- Ingredientes: categoría, nombre, costo, proveedor, unidad (`unid.`, `kg`, `L`) y control de stock.
- Grupo modificador, paso 1: nombre, nombre público, lógica de precio final (`suma` o `máximo`), mínimo y máximo.
- Paso 2: productos del grupo, precio y cantidad máxima por opción.
- Paso 3: asociación del grupo a productos.

**Modelo**

- `ingredients` puede reutilizar variantes con flag `is_ingredient`.
- `recipes`, `recipe_components`, `subrecipes`, merma/rendimiento y unidad convertida.
- `modifier_groups`, `modifier_options`, `product_modifier_groups`.
- Descontar ingredientes al confirmar/preparar según política; registrar versión de receta usada.

**Reglas**

- Conversiones de unidad explícitas; nunca mezclar kg/g o L/ml sin factor.
- Una receta versionada no cambia el costo histórico de ventas.
- Modificador valida mínimo/máximo y lógica de precio en backend.
- “Vender sin stock” no debe permitir ingredientes negativos si la política del local lo prohíbe.

### 8.5 Importación de menú

- Importar plantilla Excel con las hojas anteriores.
- Opción futura de foto/PDF con IA: extraer a borrador, mostrar confianza y exigir revisión humana de nombres/precios/categorías.
- Nunca publicar ni afectar stock directamente desde OCR.

### 8.6 Comandas y Kitchen Display System

**Interfaz/funcionalidad observada**

Áreas de impresión, comandas, tiempos por producto/categoría, alertas sonoras y estados pendiente, preparando, terminado/listo y entregado. Se diferencia “demorado” y “muy demorado”.

**Implementación**

- `prep_stations`, `kitchen_tickets`, `kitchen_ticket_items`, `prep_events`.
- KDS en tiempo real mediante WebSocket/SSE.
- Cronómetros calculados desde eventos, no incrementados en navegador.
- Reenvío/cancelación visible y auditable.
- Fallback a impresión por estación.

### 8.7 Delivery gastronómico

- Tableros preparando, listo, enviado; asignar repartidor y seguimiento.
- Tienda/menú online con horarios, retiro/delivery, pedidos programados y mínimo.
- Costos fijos o por zona; Google Maps y proveedor de última milla opcional.
- Reutilizar commerce-service y shipping-service; Food solo agrega tiempos/cocina.

### 8.8 Carta QR y pedido desde mesa

- QR general de solo consulta o QR firmado por mesa/sesión.
- Ver carta, seleccionar modificadores y, si está habilitado, enviar pedido.
- Token corto con expiración y firma; nunca exponer IDs secuenciales ni permitir cargar a una mesa cerrada.
- Flujo de aprobación configurable antes de cocina.

### 8.9 Reservas

- Calendario, disponibilidad por área/mesa/capacidad, datos del cliente, notas, depósito, confirmación y no-show.
- WhatsApp para confirmar/reprogramar, con traspaso a persona.
- Estados: consulta, pendiente, confirmada, sentada, completada, cancelada, no-show.

### 8.10 Propinas y división de cuenta

- Propina sugerida por porcentaje o monto, editable y separada de venta/impuestos según regla aplicable.
- División por partes, comensales o productos; múltiples medios.
- `tips`, `tip_allocations`, `staff_tip_payouts` independientes de `sales_revenue`.
- Reporte y cierre por turno/empleado.

### 8.11 Gastos, cuentas y finanzas

- Gastos operativos/administrativos, categoría, proveedor, medio, fecha, documento y centro de costo.
- Cuentas por pagar/cobrar y flujo de caja.
- Estado de resultados con la estructura del archivo revisado.
- La contabilidad de gestión no sustituye un libro contable/legal; exportar a integración contable.

### 8.12 Campañas y agente de WhatsApp

- Segmentos de clientes, consentimiento, plantilla aprobada, programación, métricas y baja.
- Agente de ventas responde catálogo/horarios, toma pedido y escala a humano.
- Las confirmaciones sensibles —precio final, dirección, pago y cancelación— se validan por APIs, no por texto generado libremente.

### 8.13 Configuración de impresión Food

El Word detalla:

- Tamaño de encabezado/cuerpo/pie.
- Impresión al cerrar pedido.
- Grupos modificadores sin precio.
- Largo máximo del nombre.
- Símbolo de moneda.
- ID completo, últimos dígitos o sin ID.
- Encabezado/pie, logo de hasta 2 MB en blanco y negro y prueba.
- Comandas agrupadas o desagrupadas, cancelaciones y propina.
- Cajón de dinero, cierre por email y tamaño global de interfaz.

Implementar presets seguros y una vista previa; validar que los valores de largo estén entre 4 y 100 como indica la referencia entregada.

---

## 9. Inventario completo de pantallas propuestas

### 9.1 Logify Gestión

| Módulo | Pantallas |
|---|---|
| Inicio | Resumen, actividad y accesos rápidos |
| Documentos | Nuevo, buscador, detalle, cotizaciones, notas de venta, DTE, guías, devoluciones, créditos y abonos |
| Catálogo | Productos/servicios/packs, detalle, marcas, tipos, atributos, categorías, importaciones y etiquetas |
| Inventario | Stock, kardex, recepción, consumo, ajustes, transferencias, conteos y alertas |
| Compras | Órdenes, recepción, documentos proveedor, costos y reposición |
| Clientes | Lista, perfil 360°, crédito, cobranza, depósitos, puntos, segmentos y atributos |
| Comercial | Listas, promociones, cupones y fidelización |
| Caja/Pagos | Sesiones, movimientos, arqueos, terminales, transacciones, reembolsos y conciliación |
| Pedidos/Despachos | Pedidos, preparación, guías, zonas, tarifas, transportistas, tracking y calendario |
| Reportes | Ventas, productos, stock, compras, clientes, pagos, entregas, finanzas y auditoría |
| Ecommerce | Resumen, pedidos, catálogo web, colecciones, contenido, diseño, dominio, entrega, pago y analítica |
| Automatización | Reglas, plantillas, ejecuciones y fallos |
| Plataforma | Integraciones, API keys, webhooks y logs |
| Configuración | Empresa, sucursales, bodegas, tributación, documentos, impuestos, POS, impresión, usuarios y seguridad |
| Cuenta | Plan, consumo, cobros, facturas, servicios, referidos, exportación y cancelación |
| Ayuda | Base de conocimiento, ticket, diagnóstico y onboarding |

### 9.2 Logify POS

- Login/cambio de usuario.
- Selección de sucursal/caja y apertura.
- Venta/productos/carrito.
- Cliente rápido.
- Borradores/preventas.
- Pago y terminal.
- Confirmación, DTE, impresión/envío.
- Búsqueda de ventas y reimpresión.
- Devolución/reembolso.
- Abono de cliente.
- Ingreso/egreso.
- Recepción rápida opcional.
- Arqueo y cierre.
- Operaciones pendientes/sincronización.

### 9.3 Logify Stock

- Inicio.
- Inventarios activos/historial.
- Crear y definir alcance.
- Escanear.
- Contar.
- Diferencias/recuento.
- Aprobar/reconciliar.
- Compartir/exportar.
- Productos/lista/detalle/creación rápida.
- Recepción y transferencia móvil futuras.
- Cuenta, preferencias y sincronización.

### 9.4 Logify Food

- Servicio/mesas.
- Pedido salón/mostrador/delivery.
- Reservas.
- Cocina/KDS.
- Carta QR.
- Recetas/ingredientes/modificadores.
- Turnos, propinas y caja.
- Delivery y repartidores.
- Configuración de impresión/tiempos.

---

## 10. Catálogo de piezas de componente

### 10.1 Navegación y contexto

`AppShell`, `TopBar`, `Sidebar`, `MobileBottomNav`, `WorkspaceSwitcher`, `LegalEntitySwitcher`, `BranchSwitcher`, `WarehouseSwitcher`, `Breadcrumbs`, `ModuleTabs`, `CommandPalette`, `QuickActions`, `HelpLauncher`, `NotificationBell`, `UserMenu`.

### 10.2 Datos y búsqueda

`DataTable`, `VirtualizedTable`, `ResponsiveEntityList`, `FilterBar`, `AdvancedFilterDrawer`, `SavedViews`, `ColumnPicker`, `SortMenu`, `Pagination`, `BulkActionBar`, `ExportMenu`, `SearchInput`, `VoiceSearch`, `BarcodeSearch`, `DateRangePicker`, `ComparisonPicker`, `StatusBadge`, `EntityAvatar`, `EmptyState`, `ErrorState`, `Skeleton`.

### 10.3 Formularios

`FormSection`, `FieldHelp`, `MoneyInput`, `QuantityInput`, `PercentageInput`, `RutInput`, `PhoneInput`, `AddressEditor`, `ContactEditor`, `TaxSelector`, `UnitSelector`, `SecretField`, `ImageUploader`, `FileUploader`, `RichTextEditor`, `ScheduleEditor`, `ConditionBuilder`, `TagSelector`, `CustomFieldsRenderer`, `ValidationSummary`, `UnsavedChangesGuard`.

### 10.4 Catálogo e inventario

`ProductPicker`, `VariantPicker`, `ProductCard`, `VariantMatrix`, `BarcodeField`, `SkuGenerator`, `PackComposer`, `StockSummary`, `AvailabilityBadge`, `StockLedger`, `MovementReason`, `SerialLotCapture`, `WarehouseMatrix`, `TransferStepper`, `InventoryCountGrid`, `QuantityStepper`, `CostBreakdown`, `ReorderSuggestion`, `LabelDesigner`.

### 10.5 Venta, documentos y pagos

`DocumentTypePicker`, `DocumentComposer`, `LineItemGrid`, `ManualLine`, `CustomerPicker`, `SellerPicker`, `DeliveryMode`, `PriceListPicker`, `DiscountEditor`, `CouponInput`, `LoyaltyRedeemer`, `TotalsPanel`, `TaxBreakdown`, `ReferenceDocuments`, `PaymentDrawer`, `PaymentSplit`, `TerminalStatus`, `CashChange`, `DocumentPreview`, `FiscalStatus`, `PrintActions`, `RefundComposer`.

### 10.6 Analítica

`KpiTile`, `TrendDelta`, `ChartPanel`, `BranchDonut`, `RankingTable`, `Cohort/AgingBuckets`, `ReportDefinition`, `DrilldownLink`, `LastUpdated`, `ScheduledExport`, `MetricHelp`.

### 10.7 Mobile/offline

`CameraScanner`, `TorchToggle`, `ScanReticle`, `ManualCodeInput`, `OfflineBanner`, `SyncQueue`, `ConflictResolver`, `InstallPrompt`, `PermissionPrompt`, `MobileActionSheet`, `HapticFeedback`, `ActiveCountCard`.

### 10.8 Estados obligatorios para cada pieza

Cada componente de datos debe diseñarse con: cargando, vacío, resultado, error recuperable, error no recuperable, sin conexión, sin permiso, deshabilitado por plan y datos parciales. Las acciones destructivas o irreversibles requieren consecuencia, alcance y motivo explícitos.

---

## 11. Contratos de API y eventos recomendados

### 11.1 Convenciones REST

- Base interna: `/api/...`; pública: `/public-api/v1/...`.
- UUID en recursos; SKU/folio como campos de búsqueda, no identificador técnico.
- Paginación cursor para listas grandes.
- Filtros consistentes y respuesta con `data`, `page`, `links`.
- Errores con `code`, `message`, `field_errors`, `correlation_id` y estado HTTP correcto.
- `Idempotency-Key` obligatorio en checkout, pago, emisión fiscal, refund, recepción y movimientos.
- `If-Match`/versión para ediciones concurrentes.

### 11.2 Eventos de dominio

- `catalog.product.created|updated|disabled`
- `inventory.stock.changed`
- `inventory.count.submitted|reconciled`
- `purchase.received`
- `order.created|confirmed|cancelled|fulfilled`
- `sale.completed|reversed`
- `payment.authorized|failed|refunded`
- `fiscal.dte.submitted|accepted|rejected`
- `customer.credit.changed`
- `loyalty.points.changed`
- `shipment.ready|in_transit|delivered|failed`
- `cash.session.opened|closed|difference_detected`

Envelope: `event_id`, `event_type`, `occurred_at`, `tenant_id`, `actor`, `source`, `aggregate_id`, `aggregate_version`, `correlation_id`, `causation_id`, `payload_version`, `payload`.

### 11.3 Sagas críticas

**Checkout POS**

1. Crear operación.
2. Validar carrito/precios/stock.
3. Autorizar/capturar pagos.
4. Confirmar venta y movimientos.
5. Emitir/encolar DTE.
6. Imprimir/notificar.

Si el pago se aprueba pero la venta falla, no volver a cobrar: registrar pendiente, reintentar confirmación y, si no es recuperable, iniciar reversa supervisada.

**Pedido ecommerce**

1. Cotizar y reservar stock.
2. Crear intento de pago.
3. Confirmar por webhook.
4. Convertir carrito en pedido.
5. Asignar bodega y preparación.
6. Emitir documento en el hito configurado.
7. Crear despacho/retiro.

---

## 12. Seguridad, privacidad y cumplimiento

- Cifrado en tránsito y reposo; secretos en vault/KMS.
- Certificados y tokens con acceso mínimo, rotación y alertas de vencimiento.
- No guardar datos completos de tarjeta.
- MFA para propietarios/administradores y operaciones sensibles.
- Sesiones revocables y registro de dispositivos.
- RBAC más scopes de sucursal/bodega; defensa en backend.
- Logs sin RUT, direcciones, tokens o XML completo salvo almacenamiento protegido y propósito definido.
- Exportaciones con expiración y URL firmada.
- Auditoría inmutable para folios, DTE, stock, caja, pagos, permisos y eliminaciones.
- Backups con pruebas periódicas de restauración.
- Política de retención por tipo de dato y exportación al cerrar cuenta.
- Rate limit, validación de archivo, antivirus y protección contra fórmulas en CSV.
- Consentimiento y baja en marketing/WhatsApp.
- Revisión tributaria y legal chilena antes de producción; automatizar actualización de catálogos sin asumir que una captura de 2026 es norma permanente.

---

## 13. Estrategia de pruebas

### 13.1 Pirámide

- Unitarias: cálculo, promociones, impuestos, disponibilidad, costo, estados y permisos.
- Contrato: APIs internas, proveedores de pago/DTE y eventos.
- Integración con PostgreSQL: locks, idempotencia, outbox y migraciones.
- E2E: POS, documento, devolución, recepción, inventario móvil, ecommerce y cierre.
- Visuales: POS táctil, PDFs, etiquetas, móvil y editor ecommerce.
- Carga: checkout, búsqueda catálogo, stock y webhooks.
- Caos controlado: timeout SII/adquirente, duplicación de webhook, caída tras cobro y reconexión móvil.

### 13.2 Casos que no pueden faltar

- Dos cajas venden la última unidad simultáneamente.
- Doble clic/reintento no duplica venta, pago, movimiento ni folio.
- Pago aprobado con respuesta perdida.
- DTE rechazado después de venta cobrada.
- Devolución parcial repetida.
- Transferencia enviada y recibida parcialmente.
- Inventario móvil offline editado también en servidor.
- Cupón llega a último uso en dos checkouts.
- Cierre con diferencia y aprobación.
- Cambio de precio/impuesto/producto no altera documento histórico.
- Tenant A jamás accede a dato/archivo/evento de tenant B.
- Barcode de PDF se decodifica y precio/nombre caben en etiqueta.

---

## 14. Migración técnica desde el Logify actual

### Etapa 1: preparar sin cambiar comportamiento

- Introducir módulos internos y repositorios manteniendo endpoints.
- Agregar outbox, auditoría, correlation IDs e idempotencia.
- Crear permisos y mapear roles actuales: `owner`, `admin`, `ops`, `warehouse`, `vendor`, `shipper`.
- Incorporar `branch_id`/`warehouse_id` inicialmente con una sucursal y bodega por tenant.

### Etapa 2: migrar inventario

- Crear catálogo/variantes nuevas desde inventario actual.
- Crear saldo inicial como movimiento `opening` por bodega.
- Ejecutar doble lectura/comparación temporal.
- Bloquear actualización directa de cantidad y escribir solo por servicio de stock.
- Reconciliar tenant por tenant antes de activar.

### Etapa 3: unificar venta/documentos/caja

- Envolver venta actual en `commercial_document` y `payment`.
- Migrar cierres y generar movimientos de caja derivados.
- Mantener endpoints adaptadores para frontend mientras se reemplaza el POS.

### Etapa 4: fiscal y pagos

- Activar sandbox por tenants internos.
- Certificación/proveedor DTE y pruebas de pagos.
- Piloto con una sucursal, un documento y un adquirente.
- Panel de operaciones pendientes y runbook antes de producción.

### Etapa 5: comercio y móvil

- Publicar APIs de catálogo/stock/precios ya estables.
- Lanzar Logify Stock primero; luego Commerce.
- Food solo después de validar demanda y estabilidad del núcleo.

**Rollback**

Cada migración debe tener respaldo, verificación, feature flag y camino de lectura anterior. No intentar rollback borrando movimientos o DTE; desactivar la nueva ruta y compensar de manera auditable.

---

## 15. Backlog propuesto por épicas

### Épica 1 — Plataforma transaccional

- Outbox, idempotencia y auditoría.
- Refactor modular de cuatro servicios.
- Biblioteca de estados, dinero, cantidad y eventos.
- Permisos granulares y scopes.

### Épica 2 — Sucursales e inventario confiable

- Entidad legal, sucursal, bodega y ubicación.
- Kardex/saldos/reservas.
- Ajustes, recepciones, consumos y transferencias.
- Alertas, costos y etiquetas.

### Épica 3 — Catálogo comercial

- Producto/servicio/pack, variante, marca, tipo y atributos.
- Categorías/canales/impuestos.
- Importador/exportador y edición masiva.

### Épica 4 — POS y caja

- Nuevo checkout orquestado.
- Borradores, cliente/vendedor, entrega y múltiples pagos.
- Sesiones, movimientos, arqueos, cierre y reimpresión.

### Épica 5 — DTE Chile

- Perfil fiscal, certificados y folios.
- Emisión, firma/proveedor, estados y almacenamiento.
- Boleta/factura/notas/guía.
- PDF/email, observabilidad y certificación.

### Épica 6 — Pagos

- Modelo de intent/transacción/refund.
- Mercado Pago Point primero; segundo adaptador según clientes.
- Webhooks, terminales, conciliación y comisiones.

### Épica 7 — Documentos y postventa

- Cotización, nota de venta, guía y referencias.
- Devolución, nota de crédito/débito y refund.
- Crédito, abonos, aging y cobranza.

### Épica 8 — Precios y clientes

- Listas, promociones, cupones.
- Cliente 360°, condiciones, campos y segmentos.
- Puntos y automatizaciones iniciales.

### Épica 9 — Logify Stock

- PWA móvil, escáner, offline y sincronización.
- Conteo, diferencias, aprobación, conciliación y exportación.
- Creación rápida de producto.

### Épica 10 — Commerce

- Storefront, colecciones, carrito y checkout.
- Pedido web, reserva, pago, retiro/despacho.
- Zonas, tarifas, contenido, dominio y analítica.

### Épica 11 — Ecosistema

- API pública, webhooks y portal de desarrollador.
- Centro de integraciones y logs.
- WhatsApp y conectores prioritarios.

### Épica 12 — Food opcional

- Mesas, pedidos, recetas/modificadores.
- KDS/comandas, propinas, división y QR.
- Reservas y delivery gastronómico.

---

## 16. Definición de terminado por funcionalidad

Una historia no está terminada solo porque aparece la pantalla. Debe incluir:

- permisos de frontend y backend;
- contrato y validación de API;
- migración/índices de base de datos;
- auditoría y eventos;
- idempotencia si mueve dinero, stock, folios o puntos;
- estados de carga, vacío, error y sin permiso;
- responsive/accesibilidad;
- observabilidad y correlation ID;
- pruebas unitarias, integración y E2E proporcional al riesgo;
- documentación operativa y recuperación ante fallos;
- métrica de éxito y feature flag;
- exportación/privacidad cuando corresponda.

---

## 17. Métricas de producto y operación

### Negocio del comercio

- Ventas netas, margen, ticket, frecuencia, conversión y devolución.
- Quiebre, cobertura, rotación, exactitud de inventario y merma.
- Tiempo pedido→listo→entregado y cumplimiento de promesa.
- Cartera vencida, días de cobro y recuperación.

### Salud de Logify

- Checkout exitoso y tiempo p95.
- DTE aceptados/rechazados/pendientes y tiempo a aceptación.
- Pagos aprobados, inciertos, duplicados evitados y conciliados.
- Diferencia de caja y stock por tenant/sucursal.
- Eventos/webhooks fallidos y edad de cola.
- Sincronización móvil, conflictos y operaciones offline pendientes.
- Adopción por módulo y límites de plan.

---

## 18. Decisiones recomendadas

1. **Empezar por Bsale Core**, no por Food ni por el constructor visual de ecommerce.
2. **Usar proveedor DTE mediante adaptador en la primera salida**, manteniendo opción de integración SII propia posterior.
3. **Convertir inventario a kardex por bodega antes de sumar canales**.
4. **Separar pedido, documento, pago, despacho y caja**, unidos por referencias y eventos.
5. **Mantener React/Vite/PWA y los servicios actuales**, refactorizados; no cambiar stack durante esta expansión.
6. **Construir Logify Stock como PWA offline-first** reutilizando el ecosistema actual.
7. **Tratar Food como vertical instalable**, con tablas, rutas y permisos propios.
8. **No almacenar secretos en configuración visible**; las credenciales observadas en interfaces sirven para identificar campos, nunca para copiar valores.
9. **Hacer pilotos por tenant/sucursal y feature flags** para DTE, stock y pagos.
10. **Exigir conciliación matemática y operativa**: dashboard, exportaciones, caja, pagos, documentos y kardex deben cuadrar.

---

## 19. Trazabilidad de los archivos revisados

| Archivo/tipo | Hallazgo incorporado |
|---|---|
| Capturas Bsale 12–13/08/2026 | Documentos, catálogo, inventario, POS, clientes, crédito, reportes, ecommerce, configuración, integraciones, soporte y cuenta |
| Capturas Tuin `Screenshot_20260813_*` | Navegación móvil, inventarios, escáner, conteo, cierre, exportación y productos rápidos |
| Capturas Fudo 14/08/2026 | Mesas, comandas/KDS, recetas, modificadores, delivery, reservas, finanzas, ecommerce gastronómico, WhatsApp y configuración |
| `Stock.xls` | SKU, variante, stock, costo neto, serie, moneda y tipo de cambio |
| `DetalleDocumento.xls` | Importación de líneas por cantidad, código/SKU/serie, glosa, precio, descuento, impuesto y costo |
| `Estado_de_resultados.xlsx` | Estructura mensual y total de ventas, descuentos, impuestos, CMV, margen, gastos y comisiones |
| `importar-productos.xlsx` | Productos, ingredientes y grupos modificadores en tres pasos, con validaciones SÍ/NO y campos obligatorios |
| `Formato-Zonas-*.csv` | País, regiones, comunas y tarifas por rangos/incrementos |
| `etiquetas-1786629036.pdf` | PDF carta de 7 páginas con grilla de etiquetas, nombre/variante, SKU, precio y barcode |
| `escrito softwate.docx` | Configuración Bsale; reportes, ecommerce, impresión, KDS, QR, planes y borrado de datos de Fudo |
| Repositorio Logify | Reutilización de frontend, POS, inventario, clientes, crédito, compras, caja, pedidos, despachos, notificaciones, multiempresa y billing |
| Texto adjunto de prioridades | SII, pagos, SaaS, sucursales, ecommerce, integraciones, automatización, WhatsApp, CRM, compras, API/webhooks y tracking |

---

## 20. Resultado esperado de la primera versión competitiva

La primera versión se considera realmente útil cuando un comercio puede:

1. configurar su empresa, sucursal, bodega, usuarios, impuestos, caja y certificado/proveedor fiscal;
2. importar/crear productos y existencias con trazabilidad;
3. abrir caja y vender por POS con cliente, descuento autorizado y pago integrado o manual;
4. emitir y consultar boleta/factura, imprimirla y enviarla;
5. reservar/descontar stock en la bodega correcta;
6. preparar y entregar o despachar;
7. devolver parcialmente, emitir nota, reembolsar y reintegrar/quarantinar stock;
8. cerrar caja y conciliar medios de pago;
9. revisar reportes que cuadran con documentos, pagos y kardex;
10. contar inventario desde el móvil y reconciliar diferencias con aprobación.

Ese flujo entrega más valor que una colección extensa de pantallas aisladas y crea la base estable sobre la cual añadir Commerce, automatizaciones, integraciones y Food.

---

## 21. Arquitectura para integrarse con otros sistemas

Esta sección amplía el plan después de revisar las documentaciones oficiales de Bsale, Loyverse, relBase, Square y Mercado Pago. El objetivo es que Logify pueda actuar de tres maneras:

1. **Sistema principal:** Logify conserva la verdad y publica datos/eventos a terceros.
2. **Sistema conectado:** Logify usa otro sistema como fuente de ciertas entidades, por ejemplo Bsale o Loyverse para stock histórico.
3. **Orquestador:** Logify une catálogo, venta, pago, DTE y despacho aunque cada capacidad sea prestada por un proveedor diferente.

La integración no debe implementarse agregando llamadas HTTP dentro de cada pantalla. Debe existir un **Logify Integration Hub** con contratos canónicos, adaptadores, colas, mapeos, monitoreo y controles de privacidad.

### 21.1 Matriz de capacidades de las APIs estudiadas

| Sistema | Capacidades aprovechables | Autorización/patrón | Uso recomendado en Logify | Restricción principal |
|---|---|---|---|---|
| **Bsale** | DTE, documentos, productos/servicios, variantes, stock, precios, clientes, configuración, SII, tienda online y webhooks | Token en header; también publica OAuth; REST y webhooks | Migración, coexistencia, importación histórica, sincronización de catálogo/stock y proveedor fiscal transitorio | Definir claramente qué sistema manda por entidad para evitar ciclos |
| **Loyverse** | Ítems, categorías, modificadores, clientes, inventario, recibos, turnos, tiendas, dispositivos POS, proveedores, impuestos y webhooks | Personal token para cuenta propia; OAuth 2.0 con scopes para terceros | Conector completo para comercios que ya usan Loyverse; importar y sincronizar catálogo, ventas, stock, clientes y cierres | El personal token da acceso amplio; para SaaS multiempresa se debe usar OAuth |
| **relBase** | DTE, cotizaciones, notas de venta y endpoints de productos/otros recursos documentados en v1 | Token de empresa + token de usuario integrador | Adaptador fiscal/comercial chileno; emitir documentos desde Logify y consultar su resultado | Límite publicado de 7 solicitudes por segundo y paginación por defecto de 12 registros |
| **Square** | Catálogo, inventario, pedidos, clientes, pagos, reembolsos, empleados, ubicaciones, OAuth y webhooks; POS abre la app Square para cobrar | OAuth 2.0 por vendedor; API versionada y eventos | Conector para clientes internacionales y patrón de referencia para POS externo | Procesamiento de pagos no está disponible para vendedores en Chile; POS depende de países/hardware admitidos |
| **Mercado Pago** | Checkout Pro/API, Point, QR, Orders, pagos, reembolsos, contracargos, suscripciones, OAuth, webhooks y reportes | OAuth Authorization Code para terceros; PKCE recomendado; webhooks firmados | Primera integración de pago chilena: ecommerce, POS Point, QR y cobro recurrente de Logify | Estados asíncronos, conciliación y credenciales por comercio exigen un servicio de pagos robusto |

### 21.2 Principios del Integration Hub

- **Modelo canónico:** Logify define `Product`, `Variant`, `Customer`, `Order`, `Payment`, `TaxDocument`, `StockMovement`, `Location` y `Shipment`. Cada adaptador traduce desde/hacia ese modelo.
- **Adaptadores intercambiables:** `BsaleAdapter`, `LoyverseAdapter`, `RelbaseAdapter`, `SquareAdapter`, `MercadoPagoAdapter`. El dominio no conoce URLs ni payloads externos.
- **Responsabilidad por entidad:** cada conexión declara fuente de verdad por recurso y dirección: `import_only`, `export_only` o `bidirectional`.
- **Eventos y sincronización incremental:** preferir webhook; usar polling incremental por cursor/fecha como reconciliación o cuando el proveedor no envía evento.
- **Idempotencia:** toda entrada y salida conserva ID del proveedor, evento y operación; reintentar nunca duplica datos.
- **Consistencia eventual visible:** mostrar última sincronización, atraso y errores. No afirmar “sincronizado” mientras exista cola pendiente.
- **Mínimo privilegio:** solicitar solo scopes y campos necesarios.
- **Aislamiento por tenant:** credenciales, mappings, cursores, eventos y logs siempre asociados al tenant y conexión.
- **API versionada:** congelar versión por conexión y probar una actualización antes de cambiarla.
- **Trazabilidad:** de una entidad Logify debe poder navegarse al recurso externo y viceversa.

### 21.3 Modelo de datos del Integration Hub

- `integration_providers`: código, versión, capacidades y estado global.
- `integration_connections`: tenant, proveedor, ambiente, estado, propietario, scopes, configuración cifrada y expiración.
- `integration_location_mappings`: sucursal/bodega/caja Logify ↔ ubicación externa.
- `integration_entity_mappings`: tipo, `logify_id`, `external_id`, versión/etag, hash, dirección y última sincronización.
- `integration_field_mappings`: campo canónico, campo externo, transformación y valor predeterminado.
- `sync_policies`: entidad, dirección, frecuencia, autoridad, tratamiento de borrados y conflictos.
- `sync_cursors`: cursor/página/fecha de agua alta por recurso.
- `sync_jobs` y `sync_job_items`: ejecución, contadores, estados, errores y reintentos.
- `inbound_webhook_events`: proveedor, event ID, firma válida, payload cifrado o minimizado, recepción y procesamiento.
- `outbound_deliveries`: evento Logify, destino, intento, respuesta y próxima ejecución.
- `integration_conflicts`: versiones, diferencias, resolución y usuario.
- `integration_consents`: autorización del comercio, scopes, política/versión y revocación.

Nunca usar solamente una columna `external_id` en productos: un mismo producto puede estar conectado simultáneamente con Bsale, Loyverse, Shopify y un marketplace.

### 21.4 Contrato de adaptador

Cada proveedor implementa capacidades declarativas, no una clase gigante:

- `authorize`, `refresh`, `revoke`, `healthCheck`.
- `listCapabilities` y `listScopes`.
- `pullProducts`, `pushProduct`, `pullCustomers`, `pushCustomer`.
- `pullInventory`, `pushInventoryAdjustment`.
- `pullOrders/Receipts`, `pushOrder`.
- `issueTaxDocument`, `getTaxDocumentStatus` cuando aplique.
- `createPayment`, `getPayment`, `refundPayment` cuando aplique.
- `registerWebhook`, `verifyWebhook`, `normalizeWebhook`.
- `normalizeError`, `rateLimitPolicy`, `redactForLogs`.

El adaptador devuelve resultados canónicos y errores clasificables:

- `AUTH_EXPIRED`
- `RATE_LIMITED`
- `VALIDATION_FAILED`
- `CONFLICT`
- `NOT_FOUND`
- `PROVIDER_UNAVAILABLE`
- `PERMISSION_MISSING`
- `UNCERTAIN_RESULT`

### 21.5 Motor de sincronización

**Flujo entrante**

1. Recibir webhook por HTTPS.
2. Preservar cuerpo original necesario para validar firma.
3. Verificar firma, timestamp, conexión y ambiente.
4. Deduplicar por event ID o huella estable.
5. Responder rápidamente con 2xx cuando el proveedor lo requiera.
6. Procesar en worker.
7. Obtener recurso completo si el webhook solo trae referencia.
8. Traducir al modelo canónico y validar tenant/mapping.
9. Aplicar política de autoridad/conflicto.
10. Guardar resultado, emitir evento interno y actualizar cursor.

**Flujo saliente**

1. Evento Logify llega desde outbox.
2. Resolver conexiones suscritas y scopes.
3. Aplicar minimización/transformación.
4. Enviar con idempotency key si el proveedor la admite.
5. Guardar ID/versión externa.
6. Reintentar errores temporales con backoff y jitter.
7. Enviar error permanente a dead-letter queue y crear alerta accionable.

**Reconciliación**

- Job diario/semanal compara conteos, IDs y hashes por ventana.
- Detecta eventos perdidos, webhooks fuera de orden y datos modificados directamente en el tercero.
- No corrige silenciosamente: aplica autoridad configurada o abre conflicto.

### 21.6 Gestión de límites y paginación

- Rate limiter por proveedor, conexión y endpoint.
- Cola ponderada para que una importación grande no bloquee cobros o DTE.
- Respetar `Retry-After` cuando exista.
- Backoff exponencial con máximo, jitter y circuit breaker.
- Checkpoints por página/cursor para reanudar sin comenzar de cero.
- La paginación es obligatoria incluso si el primer resultado parece completo. En relBase, por ejemplo, la documentación indica 12 registros por defecto.
- Guardar la zona horaria y semántica del filtro incremental; sumar una ventana de superposición y deduplicar.

### 21.7 Centro de integraciones en el frontend

**Pantallas**

- `/integrations`: catálogo por categoría y estado.
- `/integrations/:provider/connect`: autorización, permisos solicitados y ambiente.
- `/integrations/:connection/setup`: mapeo de sucursales, bodegas, impuestos, pagos y campos.
- `/integrations/:connection/sync`: entidades, dirección, frecuencia y fuente de verdad.
- `/integrations/:connection/activity`: jobs, webhooks, errores y métricas.
- `/integrations/:connection/conflicts`: comparación y resolución.
- `/integrations/:connection/privacy`: datos transferidos, países, subencargados, retención y revocación.

**Componentes**

`IntegrationCard`, `CapabilityBadges`, `OAuthConnectButton`, `ScopeConsent`, `ConnectionHealth`, `LocationMapper`, `FieldMapper`, `SyncDirection`, `SourceOfTruthPicker`, `InitialSyncWizard`, `SyncTimeline`, `ConflictDiff`, `RetryAction`, `TransferredDataSummary`, `DisconnectDialog`.

**Desconexión segura**

- Revocar token cuando el proveedor lo permita.
- Deshabilitar webhooks.
- Detener jobs y borrar secretos.
- Mantener mappings/auditoría el plazo necesario, pero eliminar payloads personales que ya no tengan finalidad/base.
- Explicar qué datos permanecen en Logify y por qué.

---

## 22. Funcionalidades concretas por integración

### 22.1 Conector Bsale

La API chilena de Bsale publica recursos de documentos, productos/servicios, clientes, configuración, información SII, tienda en línea y webhooks. Sus solicitudes REST usan `access_token` en la cabecera; su documentación también ofrece OAuth para escenarios de conexión de clientes.

**Funcionalidades a implementar**

- Importación inicial de oficinas/sucursales y usuarios de referencia.
- Productos, variantes, SKU/barcode, tipos, marcas, impuestos y precios.
- Clientes, direcciones y documentos por cliente.
- Stock por oficina/sucursal y cambios de stock.
- Documentos emitidos, detalles, referencias, XML/PDF y estado informado al SII.
- Pagos y formas de pago.
- Ecommerce: productos web, colecciones y ventas online si el tenant lo usa.
- Webhooks de documento, producto, variante, precio, stock y pagos.

**Modos**

1. `Migración`: importar maestros, saldos e históricos y luego desconectar.
2. `Bsale fiscal`: Logify maneja POS/operación y Bsale emite/almacena DTE.
3. `Coexistencia`: Bsale conserva ciertos canales y Logify sincroniza eventos.

**Reglas especiales**

- Un webhook Bsale puede entregar una URL de recurso; el worker debe leer el objeto y no confiar solo en la notificación.
- Mapear `officeId` a sucursal Logify.
- Producto desactivado se refleja como estado, no como borrado.
- Si Bsale es emisor fiscal, guardar en Logify ID externo, folio, URLs/XML/PDF y estados comercial/SII sin inventar aceptación.
- Evitar loop: una actualización originada en Logify y reflejada por webhook no vuelve a publicarse.

Referencia: <https://docs.bsale.dev/first-steps/> y <https://docs.bsale.dev/webhooks/>.

### 22.2 Conector Loyverse

Loyverse API v1.0 soporta tokens personales y OAuth 2.0. Para un producto SaaS multiempresa como Logify se debe usar OAuth con scopes mínimos. La API documenta recursos de ítems, clientes, empleados, inventario, recibos, turnos, tiendas, dispositivos POS, proveedores, impuestos, descuentos y modificadores.

**Funcionalidades a implementar**

- Importar tiendas y mapearlas a sucursales/bodegas.
- Importar/sincronizar ítems, variantes, categorías, modificadores y descuentos.
- Sincronizar inventario por tienda.
- Importar clientes y su identificador externo.
- Importar recibos como ventas externas con líneas, pagos e impuestos.
- Importar turnos cerrados para comparación de caja.
- Proveedores e impuestos opcionales.
- Webhooks: `inventory_levels.update`, `items.update`, `customers.update`, `receipts.update`, `shifts.create`.

**Seguridad**

- Verificar `state` en OAuth y usar callback exacto HTTPS.
- Cifrar access/refresh tokens; renovar en worker y bloquear conexión ante revocación.
- Validar firma HMAC `X-Loyverse-Signature` usando el cuerpo original.
- Solicitar solo scopes necesarios; separar lectura y escritura.
- El token personal solo se admite para una conexión propia avanzada, con advertencia de acceso amplio y opción de rotación.

**Sincronización recomendada**

- Webhook activa lectura incremental.
- Reconciliación nocturna por `updated_at`.
- Para recibos ya cerrados, importar como inmutables y corregir con evento de actualización/reversa, no editar el asiento histórico arbitrariamente.

Referencia oficial: <https://developer.loyverse.com/docs/>.

### 22.3 Conector relBase

relBase API v1 permite crear DTE, cotizaciones y notas de venta. La autenticación publicada usa token de empresa y token de usuario integrador; relBase recomienda un usuario integrador diferente por aplicación y permite limitar/desactivar sus privilegios.

**Funcionalidades a implementar**

- Wizard para tokens y prueba de conexión sin mostrarlos después de guardar.
- Mapeo de tipos documentales, sucursal, impuestos, vendedores, formas de pago y productos.
- Emisión de cotización, nota de venta o DTE desde documento canónico Logify.
- Consulta de documento, estado y archivos disponibles.
- Importación incremental de productos/documentos soportados.
- Registro de request/response redactado y correlation ID.

**Reglas técnicas**

- Respetar máximo documentado de 7 solicitudes/segundo mediante bucket por conexión.
- Paginar hasta `total_pages`; no asumir 12 resultados como total.
- Crear una credencial independiente por tenant/conexión.
- Ante timeout de emisión, consultar por referencia externa antes de reintentar.
- Implementar adaptador fiscal; no dispersar campos relBase en tablas de venta.

Referencia: <https://ayuda.relbase.cl/relbase-api-rest-primeros-pasos> y <https://apidocs.relbase.cl/>.

### 22.4 Conector Square

Square ofrece un ecosistema amplio y un buen patrón de integración: OAuth por vendedor, ubicaciones, catálogo, inventario, pedidos, clientes, pagos, reembolsos y webhooks. Su POS API abre la aplicación Square POS en iOS/Android o mobile web para procesar mediante hardware Square.

**Uso realista para Logify**

- Habilitarlo solo para tenants que operen en países soportados.
- Importar/exportar catálogo, inventario, clientes y pedidos.
- Sincronizar ubicaciones Square con sucursales Logify.
- Recibir pagos/reembolsos y cambios de inventario por webhook.
- Abrir Square POS desde Logify Stock/POS móvil cuando el país/dispositivo lo permita.

**No usar como prioridad chilena**

La documentación internacional oficial lista Australia, Canadá, Francia, Irlanda, Japón, España, Reino Unido y Estados Unidos para procesamiento de pagos; Chile no aparece. Para Chile, Mercado Pago/Transbank y adquirentes locales deben tener prioridad. Logify puede conservar Square como conector de expansión internacional y permitir solo capacidades no monetarias que el proveedor habilite.

**Lecciones de diseño aplicables a todos los conectores**

- OAuth con scopes y revocación.
- Versión explícita de API por llamada.
- Deduplicación por event ID.
- Webhooks no garantizan orden y pueden repetirse.
- Recover/reconcile mediante API después de eventos perdidos.
- Deshabilitar en UI funciones no disponibles por país/moneda/cuenta.

Referencias: <https://developer.squareup.com/docs/pos-api/what-it-does>, <https://developer.squareup.com/docs/international-development> y <https://developer.squareup.com/docs/webhooks/overview>.

### 22.5 Integración Mercado Pago

**Productos a integrar**

- **Checkout Pro:** primera alternativa ecommerce por redirección, menor alcance PCI en Logify y recuperación de pagos rechazados.
- **Point:** cobro presencial con sucursal, caja y terminal vinculadas.
- **QR:** cobro presencial/delivery asociado a sucursal y caja.
- **Orders/Payments:** estado, cancelación, reembolso y conciliación.
- **Suscripciones:** cobro recurrente de planes Logify y, como capacidad futura, membresías de los comercios.
- **Webhooks:** pagos, orders, reembolsos, contracargos y suscripciones.
- **OAuth:** autorización de cada comercio cuando Logify actúe para terceros.

**Funcionalidades frontend**

- Conectar cuenta mediante OAuth y mostrar scopes/entidad autorizante.
- Crear/mapear sucursal, caja y terminal Point.
- Probar conexión/terminal en ambiente de prueba.
- Checkout con estado en tiempo real y recuperación de operación incierta.
- Dashboard de pagos, comisiones, liquidaciones, reembolsos y contracargos.
- Conciliación por `external_reference`, monto, moneda y fecha.
- Suscripciones: plan, alta, pausa, reactivación, cancelación y cobros.

**Controles técnicos**

- Authorization Code para operar por comerciantes; PKCE y `state`.
- Access/refresh tokens cifrados y nunca enviados al frontend.
- Header `X-Idempotency-Key` estable por operación en pagos/reembolsos.
- Validar `x-signature` de webhook antes de procesar.
- Webhook actualiza estado; la URL de retorno no prueba el pago.
- En Chile, montos de ciertas APIs se expresan como enteros según la documentación del producto; encapsular moneda/precisión en el adaptador.
- No usar IPN nuevo; Mercado Pago recomienda webhooks firmados.

Referencias: <https://www.mercadopago.cl/developers/es/docs/checkout-pro/overview>, <https://www.mercadopago.cl/developers/es/docs/mp-point/overview>, <https://www.mercadopago.cl/developers/es/docs/security/oauth/creation>, <https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks> y <https://www.mercadopago.cl/developers/es/docs/subscriptions/overview>.

---

## 23. API pública de Logify para convertirse en plataforma

Logify no solo debe consumir APIs. También debe permitir que ecommerce, contabilidad, logística, BI y aplicaciones de clientes se integren con Logify de manera segura.

### 23.1 Productos de integración propios

- **API administrativa:** catálogo, clientes, stock, pedidos, documentos, pagos y despachos.
- **API storefront:** catálogo público, precios, disponibilidad, carrito y tracking; datos mínimos y rate limits propios.
- **Webhooks Logify:** eventos de negocio para terceros.
- **Bulk API:** importaciones/exportaciones asíncronas.
- **Developer Portal:** aplicaciones, credenciales, scopes, webhooks, logs, documentación y sandbox.
- **Embedded components futuros:** botón de pago, selector de productos o tracking embebible con tokens de corta duración.

### 23.2 Autenticación y autorización

- OAuth 2.1/Authorization Code + PKCE para aplicaciones de terceros con consentimiento de tenant.
- Client Credentials para integraciones servidor-a-servidor del mismo tenant.
- API keys solo para casos acotados; con scopes, expiración, rotación y restricción de IP opcional.
- Nunca compartir una admin key global entre tenants.
- Tokens cortos; refresh token rotatorio y revocable.
- Scopes iniciales: `catalog.read/write`, `customers.read/write`, `stock.read/adjust`, `orders.read/write`, `payments.read`, `documents.read/issue`, `shipments.read/write`, `webhooks.manage`.
- Scopes sensibles separados: margen/costo, RUT/direcciones, crédito, exportación masiva y DTE XML.

### 23.3 Diseño de API

- `/public-api/v1` y política explícita de compatibilidad/deprecación.
- OpenAPI generado y validado en CI.
- UUID, timestamps ISO 8601, moneda ISO 4217 y cantidades decimales como strings.
- Paginación por cursor; filtros por `updated_at` y `external_reference`.
- `Idempotency-Key` en POST sensibles.
- `ETag`/`If-Match` o versión para escrituras concurrentes.
- `429` con `Retry-After`; cuotas por app/tenant/plan.
- Errores estables con código legible y correlation ID.
- Exportaciones masivas mediante job y URL firmada temporal.

### 23.4 Webhooks Logify

- Endpoint HTTPS, secreto por suscripción y firma HMAC con timestamp.
- Event ID único, versión de payload y tenant/application ID.
- Entrega al menos una vez: el consumidor debe deduplicar.
- Reintentos con backoff, máximo y dead-letter.
- Portal con prueba, últimas entregas, respuesta, replay y rotación de secreto.
- Payload mínimo; recurso completo se obtiene por API con permisos actuales.
- Desactivar automáticamente destinos permanentemente fallidos, notificando antes.

### 23.5 Sandbox y aplicaciones de desarrollador

- Tenant sandbox con datos ficticios y sin DTE/pagos reales.
- Credenciales y URLs totalmente separadas de producción.
- Simulador de estados: pago aprobado/rechazado/incierto, DTE aceptado/rechazado, stock insuficiente y webhook duplicado.
- Colección Postman/SDK TypeScript inicial y ejemplos sin secretos reales.
- Changelog, calendario de deprecación y página de estado.

---

## 24. Protección de datos personales y cumplimiento por diseño

> Esta es una especificación técnica de cumplimiento, no sustituye una revisión jurídica del modelo de negocio, contratos, bases de licitud y tratamientos concretos de cada cliente.

En Chile, la Ley N.º 19.628 vigente se aplica hasta el 30 de noviembre de 2026. La reforma introducida por la Ley N.º 21.719 entra en vigor el **1 de diciembre de 2026**, crea la Agencia de Protección de Datos Personales y amplía derechos, obligaciones, fiscalización y sanciones. Logify debe diseñarse desde ahora para el régimen nuevo, sin dejar de cumplir el vigente.

### 24.1 Roles de Logify y del comercio

Separar contractualmente y en producto:

- **Logify como responsable:** cuentas de usuarios del SaaS, facturación del plan, seguridad, soporte y analítica propia estrictamente definida.
- **Comercio como responsable:** datos de sus clientes, trabajadores, proveedores y destinatarios que decide recopilar para venta, crédito, despacho o marketing.
- **Logify como tercero mandatario/encargado:** cuando procesa esos datos siguiendo instrucciones del comercio.
- **Proveedor/subencargado:** hosting, email, WhatsApp, analítica, DTE, pagos o soporte que procesa datos por cuenta de Logify/comercio.

No mezclar datos del comercio para crear productos publicitarios o perfiles propios sin identificar una base jurídica, informar y actualizar contratos/avisos.

### 24.2 Registro de actividades y mapa de datos

Construir un módulo interno de gobernanza:

- `processing_activities`: finalidad, categorías de titulares/datos, base de licitud, sistemas, destinatarios, transferencias, retención, riesgos y propietario.
- `data_assets`: tabla/campo/archivo/log y clasificación.
- `data_flows`: origen → Logify → proveedor/país.
- `subprocessors`: servicio, finalidad, país, contrato, seguridad y vigencia.
- `retention_policies`: evento inicial, plazo, acción, excepción/legal hold.
- `privacy_assessments`: revisión de legítimo interés, proveedor, transferencia y evaluación de impacto.

El inventario debe generarse en parte desde esquema/configuración, pero una persona debe validar finalidades y bases; no pueden inferirse jurídicamente del nombre de una columna.

### 24.3 Transparencia y aviso de privacidad

**Privacy Notice Manager**

- Avisos versionados por rol: usuario Logify, cliente del comercio, proveedor, candidato/empleado si aplica.
- Informar responsable/contacto, finalidades, base, categorías, destinatarios, transferencias internacionales, plazo, fuente y derechos.
- Mostrar aviso contextual al recopilar, no esconder todo en un texto largo.
- Guardar versión mostrada, fecha, idioma y canal.
- Historial público de cambios relevantes.

### 24.4 Consentimientos y preferencias

- `consent_purposes` versionados y separados: marketing email, WhatsApp, perfilamiento, ubicación, biometría, cookies no esenciales, etc.
- `consent_receipts`: quién, qué versión, finalidad, canal, fecha, evidencia y revocación.
- Casillas no premarcadas cuando se requiera consentimiento.
- Retirar debe ser tan accesible como otorgar y no afectar tratamientos con otra base válida.
- No pedir consentimiento innecesario para todo; documentar contrato, obligación legal o interés legítimo cuando corresponda y haya sido revisado.
- Centro de preferencias por canal y finalidad, sincronizado con campañas.

### 24.5 Portal de derechos del titular

La reforma reconoce acceso, rectificación, supresión, oposición, portabilidad y bloqueo temporal.

**Funcionalidades**

- Formulario público o autenticado para solicitudes.
- Verificación de identidad proporcional; no recopilar más datos que los necesarios.
- Tipos: acceso, corrección, eliminación, oposición, portabilidad y bloqueo.
- Bandeja con responsable, plazo legal configurable, estados, comunicaciones y evidencia.
- Búsqueda del titular en todos los servicios, archivos e integraciones mediante identificadores verificados.
- Exportación estructurada y legible; registrar alcance/origen/destinatarios cuando corresponda.
- Flujo de aprobación para eliminar/anonimizar; respetar obligaciones de conservación tributaria/contractual mediante `legal_hold` y explicar la limitación.
- Propagar rectificación/supresión a encargados e integraciones cuando proceda.
- Auditoría sin conservar innecesariamente el contenido eliminado.

Componentes: `PrivacyRequestForm`, `IdentityVerification`, `RightsCaseInbox`, `DataDiscovery`, `ExportPackage`, `ErasurePlan`, `LegalHoldNotice`, `ProcessorPropagation`, `CaseTimeline`.

### 24.6 Minimización, finalidad y conservación

- Form builder debe marcar cada campo con finalidad, base, obligatoriedad y plazo.
- No exigir fecha de nacimiento, género, biometría o ubicación si la función no lo necesita.
- Entornos de desarrollo/prueba usan datos sintéticos o anonimizados.
- Logs no contienen tokens, XML íntegro, direcciones completas, emails, RUT ni payloads de webhook sin una necesidad controlada.
- Retención automatizada por categoría; borrar, anonimizar o archivar cifrado al vencer.
- Las copias de respaldo deben expirar y contemplar restauración sin reintroducir indefinidamente datos suprimidos.
- Analítica de producto preferentemente agregada/seudonimizada.

### 24.7 Encargados, contratos y subencargados

**Vendor Privacy & Security Registry**

- Contrato/DPA, instrucciones, finalidad, datos, ubicación, subencargados, retención, devolución/supresión, auditoría, incidentes y asistencia de derechos.
- Prohibir al encargado usar datos para fines propios no autorizados.
- Al terminar, devolver o suprimir según instrucción y obligación aplicable.
- Flujo de evaluación antes de activar una integración que accede a datos personales.
- Notificar cambios de subencargados conforme al contrato/política.

### 24.8 Transferencias internacionales

La Ley 21.719 regula transferencias por adecuación, garantías —como cláusulas contractuales o normas vinculantes— y supuestos específicos.

**Funcionalidades**

- Registrar país/región de almacenamiento y soporte de cada proveedor.
- Mostrar al tenant qué categorías salen de Chile y con qué finalidad.
- `transfer_assessments`: mecanismo, contrato/cláusulas, fecha, riesgos y aprobación.
- Enrutamiento/residencia regional cuando el servicio lo permita.
- Bloquear conexión si no existe mecanismo aprobado o datos exceden el alcance.
- Mantener evidencia descargable para auditoría.

### 24.9 Evaluación de impacto en protección de datos

La reforma exige evaluación previa cuando un tratamiento pueda producir alto riesgo; enumera, entre otros, perfilamiento/decisiones automatizadas con efectos significativos, tratamiento masivo, monitoreo sistemático de zonas públicas y ciertos datos sensibles.

**DPIA Workflow**

- Trigger automático en diseño de nuevas funciones.
- Descripción del tratamiento, necesidad/proporcionalidad, riesgos, afectados y medidas.
- Revisión de privacidad, seguridad, producto y responsable de negocio.
- Riesgo residual, aprobación, fecha de revisión y consulta a autoridad cuando corresponda.
- Bloqueo de despliegue para alto riesgo no aprobado.

Funciones de Logify que requieren evaluación especial: scoring de crédito automatizado, biometría, geolocalización continua de repartidores, IA sobre conversaciones, cámaras/analítica y perfiles de consumo a gran escala.

### 24.10 Seguridad y privacidad desde el diseño y por defecto

- Clasificación: pública, interna, confidencial, personal, sensible y secreto.
- Cifrado TLS y cifrado de base/objetos; cifrado a nivel de campo para tokens, certificados y datos de alto riesgo.
- KMS/vault, rotación, separación por ambiente y no secretos en frontend/logs.
- MFA, sesiones revocables, RBAC/ABAC y principio de mínimo privilegio.
- Acceso de soporte “just in time”, con motivo, aprobación, duración y auditoría.
- Aislamiento tenant probado en queries, caché, archivos, colas y analítica.
- Backups, restauración, continuidad, RPO/RTO definidos y pruebas.
- SDLC seguro: threat modeling, revisión, SAST, dependencias, secretos, DAST y pentest proporcional.
- Gestión de vulnerabilidades con criticidad/SLA.
- Exportaciones y URLs firmadas con expiración.
- Seudonimización para analítica y ambientes no productivos.
- Revisión periódica de efectividad, no solo existencia documental.

### 24.11 Gestión de incidentes y brechas

La Ley 21.719 exige reportar a la Agencia sin dilaciones indebidas las vulneraciones que generen un riesgo razonable para derechos/libertades, registrar naturaleza/efectos/datos/titulares/medidas y, en categorías indicadas por la ley, comunicar también a titulares.

**Incident Center**

- Detección/alerta, triage, severidad y propietario.
- Línea de tiempo, sistemas/tenants/datos/titulares afectados.
- Preservación de evidencia con acceso controlado.
- Evaluación legal de riesgo y obligaciones concurrentes.
- Plantillas de comunicación claras y registro de envío.
- Tareas de contención, recuperación y prevención.
- Registro de decisión, incluso cuando se concluye no notificar.
- Postmortem y seguimiento.

No codificar un plazo universal inventado: usar motor de obligaciones por normativa y clasificación. La Ley Marco de Ciberseguridad puede imponer reportes distintos —incluida alerta temprana de tres horas para sujetos obligados ante incidentes significativos— si Logify o un cliente cae dentro de su ámbito.

### 24.12 Delegado y modelo de cumplimiento

- Permitir registrar DPO/delegado, independencia, contacto y suplencia.
- Calendario de revisiones, capacitaciones, auditorías y evidencias.
- Canal interno de consultas y aprobación de tratamientos.
- Modelo de prevención de infracciones con controles asignados y evidencia.
- El texto de la Ley 21.719 usa “podrá designar” para el delegado; la obligación concreta debe validarse según modelo de cumplimiento, tamaño, riesgo y futuras instrucciones de la Agencia. No presentarlo como universalmente obligatorio sin esa revisión.

### 24.13 Datos sensibles, niños, ubicación y biometría

- Deshabilitados por defecto salvo módulo/tenant justificado.
- Base jurídica y consentimiento explícito cuando corresponda.
- Acceso separado y registro de consultas.
- No usar reconocimiento facial/voz para asistencia sin DPIA y revisión legal.
- Geolocalización de repartidor solo durante turno/entrega, con indicador y retención limitada.
- Edad/representación y avisos adaptados cuando el servicio pueda involucrar menores.
- Evitar inferir categorías sensibles desde compras o conversaciones.

### 24.14 Datos de crédito y cobranza

La Ley 20.575 limita el tratamiento de información económica/financiera/comercial a finalidades específicas de evaluación de riesgo y proceso de crédito. Por ello:

- Crédito interno Logify no debe convertirse en un perfil reutilizado para RR.HH., marketing u otra finalidad incompatible.
- Acceso a deuda/aging bajo permiso separado.
- Exactitud, actualización, trazabilidad de fuente y mecanismo de rectificación.
- Exportación/cesión solo con finalidad y destinatario autorizados.
- La automatización de bloqueo/scoring requiere explicación, revisión humana y DPIA si produce efectos significativos.

### 24.15 Marketing, WhatsApp y cookies

- Consentimiento/preferencia por canal y finalidad; baja inmediata y lista de supresión.
- Conservar evidencia de alta/baja sin volver a activar por una importación.
- Separar mensajes transaccionales de promocionales.
- Campañas filtran menores, bloqueados, sin base y ventanas/plantillas del proveedor.
- Banner de cookies por categorías; esenciales siempre separadas de analítica/marketing.
- Scripts de GA4, GTM, Meta Pixel u otros se cargan según decisión y aviso aplicable.
- No enviar a plataformas publicitarias RUT, deuda, dirección, productos sensibles o datos no necesarios.

### 24.16 Ecommerce, consumidores y documentos electrónicos

Además de datos personales, Logify Commerce debe considerar:

- Reglamento de Comercio Electrónico: identidad/contacto del vendedor, características esenciales, precio total, stock/disponibilidad, despacho, costo, plazo, retracto/garantías y confirmación comprensible.
- Ley del Consumidor aplicable al flujo, publicidad, contratación y postventa.
- Ley 19.799 para documentos y firma electrónica cuando se utilicen contratos/aceptaciones electrónicas.
- Evidencia de términos aceptados, versión, fecha y acto afirmativo; no depender solo de un log mutable.
- Entrega de comprobante y acceso posterior.

### 24.17 Ley Marco de Ciberseguridad

La Ley 21.663 cubre servicios esenciales y operadores de importancia vital definidos por la autoridad; incluye, entre otras actividades, ciertos servicios digitales/TI gestionados por terceros y medios de pago. No debe asumirse que todo SaaS queda automáticamente clasificado, pero Logify debe poder cumplir si él o un cliente es designado.

Funcionalidades preparatorias:

- Sistema de gestión de seguridad continuo.
- Inventario de activos/dependencias y criticidad.
- Registro de controles y evidencias.
- Continuidad y recuperación.
- Gestión/reportabilidad de incidentes según obligación.
- Delegado de ciberseguridad cuando corresponda.
- Capacitación/ciberhigiene.
- Integración con CSIRT/procesos regulatorios, sin exponer datos innecesarios.

Referencias legales oficiales:

- Ley 19.628 vigente y versión diferida: <https://www.bcn.cl/leychile/navegar?idNorma=141599>
- Ley 21.719: <https://www.bcn.cl/leychile/navegar?idNorma=1209272>
- Ley 21.663: <https://www.bcn.cl/leychile/navegar?idNorma=1202434>
- Ley 20.575: <https://www.bcn.cl/leychile/navegar?idNorma=1037366>
- Reglamento de Comercio Electrónico: <https://www.bcn.cl/leychile/navegar?idNorma=1165504>
- Ley 19.799: <https://www.bcn.cl/leychile/navegar?idNorma=196640>

---

## 25. Funcionalidades de privacidad que debe ofrecer Logify a sus clientes

La privacidad puede convertirse en una ventaja comercial y no solo en trabajo interno.

### 25.1 Privacy Center por tenant

- Generador/hosting de aviso de privacidad versionado.
- Inventario básico de datos y proveedores activados.
- Propósitos y consentimientos configurables.
- Formulario de derechos con dominio del comercio.
- Bandeja de solicitudes y plazos.
- Exportación/eliminación/anonimización asistida.
- Retención por módulo con plantillas recomendadas y revisión legal.
- Registro de subencargados e integraciones.
- Centro de incidentes y plantillas de comunicación.
- Reporte de evidencia de cumplimiento.

### 25.2 Privacy API

- `POST /privacy/requests`
- `GET /privacy/requests/:id`
- `POST /privacy/requests/:id/verify`
- `POST /privacy/requests/:id/discover`
- `POST /privacy/requests/:id/export`
- `POST /privacy/requests/:id/erase`
- `POST /privacy/requests/:id/restrict`
- `POST /privacy/requests/:id/complete`
- `GET/POST /privacy/consents`
- `POST /privacy/consents/:id/withdraw`
- CRUD `/privacy/processing-activities`, `/retention-policies`, `/processors`, `/transfers`, `/assessments`, `/incidents`

Estos endpoints deben estar separados de la API comercial y exigir permisos especiales.

### 25.3 Automatizaciones de privacidad

- Detectar certificado/token/integración próxima a vencer.
- Alertar campos personales nuevos sin clasificación.
- Crear revisión cuando un proveedor cambia país/subencargado.
- Ejecutar retención con vista previa y aprobación en datos legales sensibles.
- Propagar baja de marketing a todos los canales.
- Alertar solicitud próxima a vencer.
- Detectar exportación masiva o acceso anómalo.
- Pausar sincronización si el scope fue revocado.

---

## 26. Priorización actualizada de integraciones

| Prioridad | Entrega | Valor |
|---|---|---|
| **P0** | Integration Hub: conexiones, secretos, mappings, jobs, webhooks, outbox, idempotencia y monitoreo | Evita cinco conectores incompatibles y crea plataforma |
| **P0** | Privacy/Security foundation: inventario, clasificación, permisos, auditoría, retención, derechos e incidentes | Preparación para Ley 21.719 y confianza comercial |
| **P0** | Mercado Pago Checkout Pro + webhooks + conciliación | Ecommerce y cobro online chileno |
| **P0/P1** | Adaptador fiscal relBase o Bsale, elegido mediante prueba comercial/técnica | DTE más rápido mientras madura fiscal-service |
| **P1** | Mercado Pago Point/QR + reembolsos | POS integrado y conciliado |
| **P1** | Conector Bsale de importación/migración y webhooks | Captar clientes que migran o coexisten |
| **P1** | Conector Loyverse OAuth: catálogo, stock, recibos, clientes y turnos | Captar comercios con POS existente |
| **P2** | API pública Logify + Developer Portal + webhooks | Ecosistema de terceros |
| **P2** | Mercado Pago Suscripciones para billing SaaS | Cobro automatizado de planes Logify |
| **P3** | Square para mercados internacionales soportados | Expansión fuera de Chile |

### Orden de construcción recomendado

1. Modelo canónico y ownership por entidad.
2. Vault/conexiones OAuth/tokens.
3. Webhook ingress genérico y outbox.
4. Jobs, rate limits, retries, DLQ y observabilidad.
5. Mercado Pago pagos online.
6. Un adaptador DTE chileno.
7. Bsale import/migración.
8. Loyverse OAuth/sincronización.
9. API/webhooks públicos.
10. Square internacional.

### Criterio para elegir Bsale o relBase como proveedor fiscal inicial

Realizar un spike con el mismo set de casos:

- boleta/factura afecta y exenta;
- nota de crédito parcial/total;
- guía y referencias;
- consulta de estado SII;
- XML/PDF y email;
- sucursales/folios;
- sandbox/certificación/soporte;
- idempotencia y timeout;
- portabilidad de datos/contrato/subencargados;
- costo y SLA.

La decisión no debe basarse solo en cuántos endpoints existen. Debe ganar el proveedor con mejor cobertura del flujo, trazabilidad, seguridad, soporte y salida contractual.

---

## 27. Criterios de aceptación del ecosistema de integraciones

El Integration Hub se considera listo cuando:

1. un tenant conecta y revoca una cuenta sin intervención manual de soporte;
2. ninguna credencial aparece en navegador, logs o exportaciones;
3. dos tenants del mismo proveedor permanecen completamente aislados;
4. un webhook duplicado o fuera de orden no duplica ni retrocede operaciones;
5. un timeout de pago/DTE se resuelve consultando antes de reintentar;
6. una importación se reanuda desde checkpoint y respeta rate limits;
7. cada entidad muestra fuente de verdad, ID externo y última sincronización;
8. un conflicto se explica y resuelve con auditoría;
9. la desconexión revoca acceso, detiene procesos y aplica retención;
10. el tenant puede ver datos/scopes transferidos y proveedores/países involucrados;
11. las solicitudes de derechos encuentran datos dentro de integraciones conectadas;
12. los simuladores cubren rechazo, revocación, 429, webhook inválido, pérdida de evento y caída del proveedor.
