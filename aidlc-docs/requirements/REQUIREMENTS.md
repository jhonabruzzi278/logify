# Requirements

Extraído del código, README y wiki existentes — el proyecto no tiene un documento de requisitos formal separado, así que este documento formaliza requisitos que ya están implementados (no aspiracionales), organizados por dominio funcional.

## Functional Requirements

### Autenticación y Autorización
- FR-1: El sistema debe autenticar usuarios vía JWT propio (`POST /api/auth/login`), sin depender de un proveedor externo. *(Implementado — `orders-service`)*
- FR-2: El sistema debe soportar 7 roles con permisos diferenciados server-side y client-side (`owner`, `ops`, `warehouse`, `shipper`, `vendor`, `support`, `customer`). *(Implementado — `wiki/Roles-y-RBAC.md`)*
- FR-3: Solo `owner`/`admin` puede crear, listar, editar o eliminar usuarios. *(Implementado)*
- FR-4: El sistema debe soportar recuperación de contraseña vía pregunta secreta + token JWT de corta duración. *(Implementado — `security-module.js` en orders-service)*

### Gestión de Clientes
- FR-5: El sistema debe registrar clientes con nombre, teléfono, dirección, email y RUT chileno validado (módulo 11). *(Implementado)*
- FR-6: El sistema debe ofrecer autocompletado de direcciones vía geocodificación (Nominatim/OpenStreetMap). *(Implementado)*

### Gestión de Inventario
- FR-7: El sistema debe permitir CRUD de productos (SKU, nombre, stock, precio, costo, categoría, imagen). *(Implementado)*
- FR-8: El ajuste de stock debe ser atómico y prevenir stock negativo (stored procedure `fn_adjust_stock`). *(Implementado)*
- FR-9: El sistema debe clasificar productos por nivel de stock (SIN_STOCK / CRITICO / BAJO / NORMAL) vía stored procedure. *(Implementado)*
- FR-10: El sistema debe soportar ventas directas de punto de venta (POS) que descuentan stock sin pasar por el flujo de órdenes. *(Implementado — rol `vendor`)*
- FR-11: El sistema debe generar reportes de inventario en PDF y códigos QR por producto. *(Implementado)*
- FR-12: El sistema debe mostrar indicadores económicos chilenos (UF, USD, UTM) con caché de 1 hora. *(Implementado)*

### Gestión de Pedidos (Orders)
- FR-13: El sistema debe generar un código de cliente único `SL-XXXXXX` al crear cada pedido. *(Implementado)*
- FR-14: Confirmar un pedido debe orquestar automáticamente: descuento de stock (inventory-service) → creación de envío (shipping-service) → cambio de estado a `EN_PREPARACION` (patrón Saga). *(Implementado)*
- FR-15: Cancelar un pedido en estado `CREATED` o `EN_PREPARACION` debe restaurar el stock automáticamente. *(Implementado — stored procedure `fn_cancel_order`)*
- FR-16: El sistema debe ocultar el campo `client_code` en las respuestas API para los roles `shipper`, `customer` y `vendor`, sin importar lo que la UI intente mostrar (server-side enforcement). *(Implementado — `RESTRICTED_ROLES` en orders-service)*
- FR-17: Debe existir un endpoint público (sin autenticación) para que el cliente final rastree su pedido solo con el código `SL-XXXXXX`, exponiendo únicamente campos seguros (sin email/teléfono/RUT del cliente). *(Implementado)*

### Gestión de Envíos (Shipping)
- FR-18: El sistema debe generar un número de tracking único `TRACK-XXXXXXXX` al crear un envío. *(Implementado)*
- FR-19: El envío debe transicionar por etapas: `EN_PREPARACION → EN_REPARTO → ENTREGADO`, o `CANCELADO`. *(Implementado)*
- FR-20: Marcar un envío como `ENTREGADO` debe requerir dos factores de validación server-side: el código de cliente (`SL-XXXXXX`) y el RUT del receptor, ambos cruzados contra la base de datos de orders-service. *(Implementado — mecanismo central de integridad de entrega)*
- FR-21: El sistema debe mostrar riesgo climático de entrega (vía Open-Meteo) y ruta/distancia estimada (vía OSRM) para cada envío. *(Implementado)*
- FR-22: Cada cambio de etapa de envío debe notificar automáticamente al notification-service. *(Implementado)*

### Notificaciones y Trazabilidad
- FR-23: El sistema debe registrar de forma idempotente cada evento del ciclo de vida de un pedido (unique constraint en `event_id`+`audience`+`tenant`), devolviendo 409 en duplicados. *(Implementado)*
- FR-24: Las notificaciones deben segmentarse por audiencia (`CLIENT`, `OPERATOR`, `BOTH`/system). *(Implementado)*
- FR-25: El sistema debe soportar notificaciones push del navegador (Web Push + VAPID) para alertas de stock y clima. *(Implementado)*
- FR-26: El sistema debe generar reportes de trazabilidad en PDF. *(Implementado)*

### Multi-Tenancy
- FR-27: El sistema debe aislar datos por tenant (`tenant_id`) en las 4 bases de datos, derivado exclusivamente del JWT verificado (nunca de un header no autenticado). *(Implementado — Fase 4C, ver `wiki/Multi-Tenant.md`)*
- FR-28: El sistema debe rechazar tokens JWT cuyo tenant no coincida con el subdominio/tenant resuelto de la request (previene reuso cross-tenant de tokens). *(Implementado y verificado con tenant de prueba `acme`)*
- FR-29: El sistema debe aprovisionar tenants y su usuario owner mediante signup self-service, con prueba gratuita y cupones administrables por API. *(Implementado — Fase 4E; el panel visual de super-admin sigue pendiente)*
- FR-30: El sistema debe servir cada tenant mediante `*.logify.cl` con TLS y reservar `app.logify.cl` como portal central neutral. *(Implementado — Fase 4D + portal central)*

### Frontend / PWA
- FR-31: La aplicación debe ser instalable como PWA con soporte de notificaciones push en background. *(Implementado — `vite-plugin-pwa`, `src/sw.ts`)*
- FR-32: La navegación debe restringirse por rol (redirect automático a la ruta por defecto del rol si se intenta acceder a una ruta no permitida). *(Implementado — `app/auth.tsx`, `usePermissions()`)*
- FR-33: El cliente PWA debe detectar una nueva versión del service worker y recargar una sola vez al tomar control, evitando ejecutar bundles obsoletos. *(Implementado — `Frontend/src/main.tsx`)*
- FR-34: El calendario debe mostrar únicamente envíos obtenidos desde la API, sin generar registros sintéticos en el cliente. *(Implementado — `calendar-page.tsx`, `calendar-shipments.ts`)*

## Non-Functional Requirements

| Categoría | Requisito | Estado |
|---|---|---|
| Seguridad | Rate limiting (200 req/min por defecto), Helmet, CORS explícito por allowlist | Implementado (`shared/security.js`) |
| Seguridad | Contraseñas hasheadas con bcrypt, nunca en texto plano en BD | Implementado |
| Seguridad | JWT compartido entre microservicios vía `JWT_SECRET` env var | Implementado — rotación coordinada documentada en `wiki/Rotacion-JWT.md` |
| Disponibilidad | Health checks (`/health`, `/healthz`) en cada servicio + gateway | Implementado, usado por Docker `HEALTHCHECK`, CI/CD y Uptime Kuma |
| Resiliencia | Apagado ordenado (graceful shutdown) ante SIGTERM/SIGINT | Implementado (`shared/shutdown.js`) |
| Resiliencia | Manejo de fallas parciales en el Saga de confirmación de orden | Parcial — existe compensación automática de stock si falla shipping; si la compensación falla se requiere revisión manual |
| Performance | Cobertura de tests backend | En progreso — ver discrepancia de números en `testing/TEST_COVERAGE_REPORT.md`, meta interna declarada de 60% |
| Observabilidad | Logging estructurado, métricas, APM | Parcial — logs JSON y `X-Request-ID` implementados; faltan métricas, APM y agregación centralizada |
| Portabilidad | Contenerización completa (Docker) de todos los servicios | Implementado |
| Costo | Infraestructura de costo controlado | Implementado con VPS de costo fijo bajo y Vercel para Frontend/Landing |

⚠️ **Pendiente validación humana:** requisitos regulatorios/compliance para RUT y datos personales, SLA de negocio y requisitos de escalabilidad más allá de la capacidad medida del VPS actual. La política técnica de retención está documentada en `wiki/Politica-Retencion-Datos.md`, pero requiere validación legal y operativa.
