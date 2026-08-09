# Stakeholders — Mapa de Interesados de Logify

> **Propósito de este documento:** a diferencia de un documento técnico estándar de AI-DLC, este archivo está deliberadamente redactado para dos audiencias a la vez: (1) el equipo interno, y (2) **terceros externos — inversionistas ángeles, fondos pre-seed, programas de financiamiento público (Corfo, Start-Up Chile), o un socio estratégico** — que podrían leerlo como parte de un proceso de levantamiento de capital o venta del sistema.
>
> **Regla de integridad que se mantiene incluso en este contexto:** ningún dato de tracción, cliente, ingreso o inversionista comprometido se inventa. Un pitch se cae al primer due-diligence si los números no resisten una pregunta de seguimiento. Lo que sí se hace aquí es **presentar con la mejor luz posible lo que es genuinamente real y verificable** (arquitectura, features, tests, eficiencia de costos) y marcar explícitamente lo que es mercado potencial, supuesto razonado, o pendiente de decisión. Esa distinción — no la ausencia de honestidad — es lo que hace un documento de stakeholders creíble ante un inversionista sofisticado.

---

## 1. Resumen Ejecutivo (para quien lee esto en 90 segundos)

**Logify** es una plataforma SaaS de gestión logística end-to-end — pedidos, inventario, envíos y notificaciones en un solo sistema — construida como arquitectura de microservicios (4 servicios Node.js independientes + gateway + PostgreSQL), con un frontend PWA instalable y control de acceso diferenciado para **7 roles operativos reales** (dueño, operaciones, bodega, transportista, vendedor, soporte, cliente).

El diferenciador central del producto no es genérico: Logify resuelve un problema concreto de **última milla** — cómo probar, de forma verificable, que un pedido llegó a la persona correcta — con un mecanismo de doble factor (código único de cliente `SL-XXXXXX` + RUT del receptor) que el propio repartidor no puede ver ni falsificar. Esto es un detalle de diseño de producto, no un checkbox de feature list: fue pensado, implementado, y está cubierto por tests automatizados.

**Etapa actual:** producto técnicamente completo y operando en producción desde el 2026-08-06, con backend en VPS, Frontend/Landing en Vercel, monitoreo Uptime Kuma y **558 tests automatizados** medidos el 2026-08-09. No hay evidencia en el repositorio de clientes pagando ni ingresos; esa validación comercial continúa pendiente.

**La tesis para un inversionista o comprador potencial:** el riesgo técnico de "¿se puede construir esto?" ya está resuelto — el producto existe, opera en producción y completó las fases multi-tenant 4A-4E. El riesgo principal restante es comercial: validar clientes, precios y canal de adquisición.

---

## 2. Equipo Interno / Fundador

| Evidencia | Detalle |
|---|---|
| Dueño del repositorio / committer principal | JONAHBRUZZI (`jon.guerra@duocuc.cl`) — GitHub [`jhonabruzzi278/logify`](https://github.com/jhonabruzzi278/logify) |
| Origen del proyecto | Dominio de correo `@duocuc.cl` (DuocUC, institución de educación técnica chilena) sugiere origen académico o de bootcamp — un punto de partida común y respetable para un producto que luego se profesionaliza hacia SaaS real |
| Colaboradores | Branches `develop`, `darlette`, `victor` en el historial de git sugieren un equipo pequeño de 2-4 personas |
| Estilo de trabajo | Commits en español, con prefijos tipo conventional-commits (`feat:`, `fix:`, `chore:`) — flujo de trabajo organizado aunque informal |

⚠️ **Pendiente de definir formalmente (relevante para cualquier conversación de inversión):** distribución de roles del equipo (quién es CEO/técnico/producto), % de equity o participación entre colaboradores, y si el proyecto seguirá siendo liderado por el equipo actual o buscará incorporar cofundadores/advisors. Ningún documento del repo resuelve esto — es una decisión de negocio, no técnica.

---

## 3. Usuarios Finales — Las 7 Personas del Sistema

Esta es la evidencia más sólida de product thinking real que existe en el proyecto: no son roles genéricos de "admin/user", son **7 personas construidas alrededor de un flujo de negocio logístico real**, cada una con su propia vista por defecto y permisos server-side (no solo ocultos en el frontend). Para un inversionista, esta tabla es en sí misma una prueba de que el equipo entendió el dominio antes de escribir código.

| Rol | Representa | Vista por defecto | Necesidad central que resuelve el producto |
|---|---|---|---|
| `owner` | Dueño/gerente de la empresa logística | `/dashboard` | Visibilidad y control total: usuarios, pedidos, inventario, envíos, reportes — el comprador económico del producto (ver sección 4) |
| `ops` | Coordinador de operaciones | `/orders` | Crear/confirmar pedidos, asignar transportistas, monitorear el pipeline completo |
| `warehouse` | Personal de bodega | `/inventory` | Ajustar stock, confirmar disponibilidad, responder a alertas de quiebre de stock |
| `shipper` | Transportista/repartidor | `/deliveries` | Ver entregas asignadas, avanzar etapas del envío, confirmar entrega — **sin poder ver el código de verificación del cliente**, por diseño |
| `vendor` | Vendedor de punto de venta | `/pos` | Registrar ventas presenciales, consultar stock, sin pasar por el flujo completo de pedidos |
| `support` | Soporte/monitoreo | `/alerts` | Visibilidad de solo lectura sobre pedidos, envíos, alertas y trazabilidad completa |
| `customer` | Cliente final | `/tracking` | Rastrear su propio pedido usando únicamente su código `SL-XXXXXX`, sin necesidad de cuenta ni login |

**Por qué esto importa para vender el sistema:** cada uno de estos 7 roles representa un segmento de usuario con necesidades distintas dentro de una misma empresa cliente. Esto significa que el producto no vende "un asiento", vende **una operación completa** — lo cual típicamente se traduce en un contrato por empresa (no por usuario), un ciclo de venta B2B, y una razón real para que el `owner` sea quien firme el contrato mientras 6 tipos de usuario distintos lo usan a diario.

---

## 4. Cliente Objetivo (Comprador Económico)

⚠️ **No existe todavía un cliente real nombrado en el repositorio** — ni un caso de uso de un negocio específico, ni un contrato, ni un piloto documentado. Lo que sigue es el **perfil de cliente objetivo inferido razonablemente de las decisiones de producto ya tomadas**, no una lista de clientes existentes.

**Perfil inferido:**
- **Quién firma:** el rol `owner` — dueño o gerente general de una PYME que gestiona pedidos, inventario y despacho propio (no un marketplace ni un 3PL grande).
- **Tamaño de empresa objetivo:** pequeña/mediana empresa con equipo de reparto propio (justifica los roles `warehouse` y `shipper` diferenciados) pero sin presupuesto para un ERP logístico enterprise — el mismo perfil que hoy resuelve esto con planillas de Excel, WhatsApp y llamadas telefónicas.
- **Sector:** e-commerce, retail con despacho propio, o distribución minorista — cualquier negocio donde "¿le llegó el pedido a la persona correcta?" es una pregunta real y costosa de responder mal (reclamos, fraude de entrega, pérdida de mercadería).
- **Geografía inicial:** Chile — evidenciado por la validación de RUT chileno (módulo 11) integrada en el flujo de clientes, indicadores económicos chilenos (UF/USD/UTM vía mindicador.cl), y el dominio `logify.cl` ya en proceso de configuración.
- **Ángulo de expansión LatAm:** la arquitectura no tiene nada intrínsecamente atado a Chile más allá de la validación de RUT (aislable/reemplazable) y el dominio — un argumento de mercado direccionable más amplio (TAM regional) que vale la pena mencionar en un pitch, siempre etiquetado como tesis de expansión, no como mercado ya validado.

⚠️ **Pendiente de validación humana:** tamaño real de mercado (TAM/SAM/SOM), disposición a pagar, precio objetivo, y si existe ya alguna conversación informal con un potencial cliente piloto que no esté documentada en el repo.

---

## 5. Interesados Externos Potenciales (Ecosistema de Financiamiento)

Ninguno de los siguientes es un interesado confirmado hoy — es el **mapa de a quién tendría sentido acercarse**, dado el perfil del proyecto (equipo chileno, origen académico/técnico, producto SaaS B2B en etapa MVP). Se documentan como opciones reales del ecosistema chileno de emprendimiento, no como compromisos existentes.

### Financiamiento público / no dilutivo (Chile)
| Programa | Por qué encaja | Fuente |
|---|---|---|
| **Corfo — Subsidio Semilla de Asignación Flexible (SSAF)** | Diseñado para etapas pre-seed/MVP con equipo chileno, exactamente el estado actual del proyecto | corfo.cl |
| **Start-Up Chile** | Programa de aceleración estatal para startups en etapa temprana, con historial de aceptar equipos con producto ya construido pero sin tracción comercial aún | startupchile.org |
| **InvestChile / ChileGlobal Ventures** | Relevante si la tesis de expansión LatAm (sección 4) se formaliza más adelante | investchile.gob.cl |

### Financiamiento privado
- **Inversionistas ángeles locales** con experiencia en logística, retail o e-commerce — el perfil de founder-market-fit (equipo técnico con producto funcional) es exactamente lo que este tipo de inversionista busca en etapa pre-seed.
- **Aceleradoras/incubadoras universitarias** — dado el origen en DuocUC, vale la pena explorar si existe un programa de incubación o vínculo institucional que el equipo pueda formalizar (⚠️ no confirmado en el repo).

### Socios estratégicos (no inversionistas, pero relevantes para la historia de "vender el sistema")
- **Couriers/operadores de última milla** locales — integración o alianza de distribución.
- **Proveedores de POS/ERP** — el módulo `vendor`/POS ya implementado es un punto de integración natural.
- **Pasarelas de pago chilenas** (Transbank, Flow, Mercado Pago) — hoy no hay integración de pagos en el sistema; sería el siguiente feature natural si se busca vender directamente a PYMEs.

⚠️ **Nada de esta sección debe presentarse a un tercero como "ya en conversación" salvo que eso sea literalmente cierto** — es un mapa de opciones, redactado para que el equipo tenga la lista lista para actuar, no para inflar el pitch con nombres de programas como si ya hubiera compromiso.

---

## 6. Estado Real y "Tracción" (la sección que un inversionista va a escrutar primero)

| Dimensión | Estado real, verificado | Fuente |
|---|---|---|
| Producto funcional | Sí — 4 microservicios + frontend + gateway corriendo vía `docker compose up` | `docker-compose.yml`, `README.md` |
| Tests automatizados | **558 tests registrados**: 435 backend + 123 Frontend, validados por suite y en CI | `aidlc-docs/testing/TEST_COVERAGE_REPORT.md` |
| Cobertura de código | Backend 82,23%-94,11% statements por servicio en ejecución local; SonarCloud mantiene una deuda separada de cobertura sobre código nuevo | ídem |
| Arquitectura multi-tenant SaaS | Fases 4A-4E implementadas: aislamiento, wildcard y onboarding self-service | `wiki/Multi-Tenant.md` |
| Costo de infraestructura | ~~Objetivo explícito de US$0/mes (Render + Neon + Vercel, planes free)~~ **actualizado el 2026-08-06**: backend migrado a VPS propio (costo fijo bajo) + Vercel free para Frontend/Landing | `wiki/Despliegue-VPS.md` |
| Despliegue en producción real | ~~No~~ **sí, desde el 2026-08-06** — backend en VPS (`api.logify.cl`), Frontend en Vercel (`app.logify.cl`), Landing en Vercel (`logify.cl`/`www.logify.cl`), monitoreo público (`status.logify.cl`). Dominio real `logify.cl` con DNS propio, TLS automático, sin credenciales demo expuestas más allá de lo documentado | `wiki/Despliegue-VPS.md`, `wiki/Despliegue-Vercel.md` |
| Clientes pagando | **Ninguno** (persiste) — no hay evidencia de cliente real, piloto, ni ingreso en el repositorio | — |
| CI/CD automatizado | ~~No — fue removido deliberadamente~~ **resuelto el 2026-08-06**: `.github/workflows/ci.yml` corre tests de los 4 microservicios + Frontend + Landing, y `main` tiene branch protection exigiendo esos 6 checks antes de mergear | `wiki/Flujo-Git.md`, `aidlc-docs/design-artifacts/ADR/ADR-003-no-cicd-platform-native-autodeploy.md` |
| Monitoreo/observabilidad en producción | Monitoreo básico con Uptime Kuma y health checks; APM, logs centralizados y `X-Request-ID` siguen pendientes | `wiki/Monitoreo.md` |

**Cómo enmarcar esto en un pitch:** la narrativa honesta y defendible es *"riesgo técnico resuelto, riesgo comercial es exactamente lo que buscamos financiar."* Un producto con 558 tests, CI obligatorio, CD con rollback, monitoreo básico y multi-tenancy self-service es una base fuerte. Lo que sigue faltando son clientes e ingresos verificables; tampoco debe prometerse escala masiva sin métricas de carga y operación sostenida.

---

## 7. Riesgos Conocidos (mejor documentarlos aquí que dejar que los descubra el inversionista)

Presentar proactivamente estos puntos en una conversación de financiamiento genera más confianza que ocultarlos — señala un equipo que conoce su propio producto en profundidad:

1. ~~**Identidad de marca inconsistente:**~~ **resuelto el 2026-08-05** — la carpeta/repo raíz ahora se llama `Logify`, coincidiendo con el nombre de producto en README/wiki/dominio.
2. ~~**Secreto JWT compartido sin rotación**~~ **mitigado el 2026-08-06** — `JWT_SECRET_PREVIOUS` permite rotar sin downtime (ver `wiki/Rotacion-JWT.md`). Sigue siendo un secreto compartido entre los 4 servicios (no hay auth service centralizado), pero ya no es "documentado y sin mitigar".
3. ~~**Sin rollback automático**~~ **resuelto el 2026-08-06** — el Saga de confirmación de pedido ahora compensa (revierte) el descuento de stock si la creación del envío falla después; si la compensación misma falla, se marca explícitamente para revisión manual en vez de fallar en silencio.
4. **Sin política de retención/anonimización de datos personales** (RUT, contacto de clientes) — **documentado el 2026-08-06** en `wiki/Politica-Retencion-Datos.md`, pero **todavía no implementado en código** (no existe endpoint de anonimización ni job de purga). Relevante de cara a compliance si se opera formalmente en Chile (Ley 19.628).
5. **Discrepancias históricas de documentación ya detectadas y corregidas** en esta auditoría (conteo de tests, cobertura reportada vs. medida) — ver `testing/TEST_COVERAGE_REPORT.md`. El hecho de que ya se hayan detectado y corregido es, en sí, una señal positiva de rigor, siempre que se presente así y no se oculte que existieron.

---

## 8. Gobernanza y Decisiones Pendientes

⚠️ Ninguno de estos puntos está resuelto en el repositorio — son decisiones de negocio que cualquier proceso de financiamiento o venta va a requerir antes de avanzar:

- Estructura societaria (¿existe una empresa constituida, o el proyecto sigue siendo un repo personal/académico?)
- Titularidad de la propiedad intelectual del código
- Modelo de licenciamiento/pricing (¿SaaS por suscripción mensual, por empresa, por transacción?)
- Roles y % de participación entre los colaboradores identificados (sección 2)
- Si se buscará financiamiento no dilutivo (Corfo/Start-Up Chile) antes o en paralelo a inversión privada

---

## 9. Roadmap Recomendado para Volverlo "Vendible"

Priorizado por impacto en credibilidad frente a un inversionista o cliente piloto, no por dificultad técnica:

1. ~~**Resolver la identidad de marca** (Logify vs. SmartLogix)~~ — resuelto el 2026-08-05.
2. **Conseguir un piloto real**, aunque sea gratuito o con un solo cliente — nada reemplaza a un caso de uso real citable.
3. ~~**Ejecutar el despliegue real en el VPS**~~ — hecho el 2026-08-06, dominio `logify.cl` real, TLS automático, monitoreo público en `status.logify.cl`.
4. **Definir estructura societaria y modelo de pricing** antes de la primera reunión formal con un inversionista.
5. ~~**Añadir monitoreo básico**~~ — resuelto: Uptime Kuma está publicado en `status.logify.cl`. Siguen pendientes APM, logs centralizados y correlación de requests.
6. **Preparar un pitch deck separado** que use este documento como fuente de verdad técnica, pero con el formato visual de una presentación de inversión (problema/solución/mercado/producto/equipo/ask) — este documento es la materia prima, no el documento para mostrar directamente a un inversionista.

---

## 10. Registro de Cambios de Esta Sección

- **2026-08-06 (tarde):** Despliegue real ejecutado — backend en VPS, Frontend y Landing en Vercel, dominio `logify.cl` con TLS real, monitoreo público en `status.logify.cl` con 7 monitores activos, backups automáticos de Postgres verificados. Actualizada la fila "Despliegue en producción real" (sección 6) y el ítem 3 del roadmap (sección 9). Ver `wiki/Despliegue-Vercel.md` (nuevo) para el detalle, incluyendo un bug real encontrado en el camino (campo `framework` vacío al crear proyectos Vercel por API).
- **2026-08-06 (mañana):** Actualizada la sección 6 (tabla de estado) y los riesgos #2-#3-#5 de la sección 7 tras una sesión de hardening técnico: migración de Render a VPS propio, CI gate obligatorio en `main` vía branch protection, rotación de JWT_SECRET, compensación real en el Saga de confirmación, monitoreo con Uptime Kuma, y documentación (sin implementación aún) de la política de retención de datos. Ver `wiki/Flujo-Git.md`, `wiki/Rotacion-JWT.md`, `wiki/Monitoreo.md`, `wiki/Politica-Retencion-Datos.md`.
- **2026-07-23:** Documento reescrito con enfoque en financiamiento/venta a solicitud explícita del equipo. Se preservó todo el contenido factual verificado de la versión anterior (roles, stakeholders internos, ausencia de stakeholders externos confirmados) y se añadieron las secciones 1, 4-9 orientadas a la narrativa de inversión. Ningún dato de tracción fue inventado; todo lo nuevo está explícitamente marcado como inferencia, opción de mercado, o pendiente de validación.
- **2026-07-19:** Versión original generada por auditoría AI-DLC inicial (ver `00_PROJECT_METADATA.md` para el detalle completo de esa auditoría).
