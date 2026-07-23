# Project Intent

## High-Level Purpose

**Logify** es una plataforma SaaS de gestión logística que unifica pedidos, inventario, envíos y notificaciones en un solo sistema, con control de acceso por rol (RBAC de 7 roles). *(Fuente real: `README.md` líneas 1-4, `wiki/Home.md`)*

El ciclo de negocio central que el sistema resuelve:
> "Cliente crea pedido → Bodega confirma stock → Transportista entrega → Cliente verifica su pedido con código SL-XXXXXX" *(Fuente: `wiki/Home.md`)*

El sistema está diseñado explícitamente para resolver un problema de **verificación de entrega en logística de última milla**: el mecanismo del "Client Code" (`SL-XXXXXX`), deliberadamente oculto al rol `shipper`, obliga al transportista a obtener el código directamente del cliente en el momento de la entrega, combinado con la validación del RUT del receptor — dos factores independientes que prueban que la entrega llegó a la persona correcta. *(Fuente real, extraída del código: `orders-service/src/index.js` generación de código, `shipping-service` validación en `PUT /:id/stage?stage=ENTREGADO`, documentado en `wiki/Codigo-de-Cliente.md`)*

## Business Objectives

Inferidos de la arquitectura y flujo de negocio implementado (no hay un documento de objetivos de negocio formal separado — se infiere del código y wiki):

1. Centralizar la gestión de pedidos, stock, envíos y comunicación en una sola plataforma en vez de procesos manuales/dispersos.
2. Garantizar trazabilidad completa de cada pedido desde creación hasta entrega (servicio dedicado `notification-service` registra cada evento de cada etapa).
3. Prevenir fraude/error en la entrega física mediante verificación de dos factores (código de cliente + RUT).
4. Dar visibilidad diferenciada por rol operativo (owner, ops, bodega, transportista, vendedor, soporte, cliente) para que cada usuario solo vea y opere lo que le corresponde.
5. Evolucionar hacia un modelo SaaS multi-tenant (una instancia sirviendo a múltiples empresas por subdominio) — ver roadmap en `wiki/Multi-Tenant.md`, actualmente en fases 4A-4C completas de un plan de 5 fases (4D/4E pendientes: dominio wildcard y auto-provisión de tenants).

⚠️ **No documentado explícitamente en ningún lado del repo:** métricas de éxito de negocio (revenue, adopción, NPS, etc.), justificación de por qué se eligió el nombre "Logify"/mercado objetivo específico más allá de "empresas que necesitan gestión logística en Chile" (inferido del uso de validación de RUT chileno y dominio `.cl`). Requiere input del Product Owner.

## Success Metrics

⚠️ **No documentado — requiere input del Product Owner.** No existen métricas de negocio (KPIs, SLA de negocio, metas de adopción) en el repositorio. Las únicas métricas cuantitativas presentes son técnicas (cobertura de tests — ver `testing/TEST_COVERAGE_REPORT.md` — y una meta interna declarada de "60% de cobertura en backend" mencionada en `wiki/Pruebas.md`).

## Constraints

### Technical
Extraído directamente del stack detectado (ver `design-artifacts/LOGICAL_DESIGN.md` para el detalle completo):
- Arquitectura de microservicios (4 servicios Node.js/Express) + base de datos por servicio (PostgreSQL, sin ORM, SQL parametrizado + stored procedures).
- Sin broker de mensajería (no Kafka/RabbitMQ/Redis pub-sub) — la comunicación entre servicios es HTTP síncrono, lo que implica que el sistema asume baja latencia entre servicios y no tolera bien fallos parciales de red (mitigado parcialmente por captura de errores en `warnings` sin rollback automático en el Saga).
- Autenticación JWT propia (no proveedor externo) — decisión post-migración fuera de AWS Cognito (ver `code-generation/GENERATED_CODE_LOG.md` para el historial de este cambio).
- Frontend PWA instalable (React + Vite + vite-plugin-pwa) — implica soporte offline parcial y necesidad de gestionar Service Worker/caché.
- Despliegue en infraestructura de capa gratuita (Render free tier + Vercel + Neon free tier) — constraint de costo explícito (**objetivo US$0/mes**, documentado en `RENDER_DEPLOY.md`), con trade-offs conocidos y aceptados: servicios backend "duermen" tras 15 min de inactividad (cold start de 30-60s), sin red privada real entre servicios (todo el tráfico inter-servicio es HTTPS público).
- Sin CI/CD automatizado — fue removido deliberadamente (commit `6018f89`); el despliegue depende del autodeploy nativo de Render/Vercel al hacer push a `main`.

### Business
- Validación de RUT chileno (módulo 11) integrada en el flujo de clientes — indica mercado objetivo primario: Chile.
- Multi-moneda/indicadores económicos chilenos (UF, USD, UTM vía mindicador.cl) integrados en inventario — refuerza el mercado objetivo chileno.
- ⚠️ Restricciones de presupuesto, timeline, o compliance (ej. protección de datos personales, Ley 19.628 chilena) no están documentadas explícitamente — pendiente de validación con el Product Owner, especialmente relevante dado que el sistema almacena RUT y datos de contacto de clientes.
