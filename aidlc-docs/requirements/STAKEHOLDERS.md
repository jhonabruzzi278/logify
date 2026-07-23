# Stakeholders — Mapa de Interesados de Logify

> **Propósito de este documento:** a diferencia de un documento técnico estándar de AI-DLC, este archivo está deliberadamente redactado para dos audiencias a la vez: (1) el equipo interno, y (2) **terceros externos — inversionistas ángeles, fondos pre-seed, programas de financiamiento público (Corfo, Start-Up Chile), o un socio estratégico** — que podrían leerlo como parte de un proceso de levantamiento de capital o venta del sistema.
>
> **Regla de integridad que se mantiene incluso en este contexto:** ningún dato de tracción, cliente, ingreso o inversionista comprometido se inventa. Un pitch se cae al primer due-diligence si los números no resisten una pregunta de seguimiento. Lo que sí se hace aquí es **presentar con la mejor luz posible lo que es genuinamente real y verificable** (arquitectura, features, tests, eficiencia de costos) y marcar explícitamente lo que es mercado potencial, supuesto razonado, o pendiente de decisión. Esa distinción — no la ausencia de honestidad — es lo que hace un documento de stakeholders creíble ante un inversionista sofisticado.

---

## 1. Resumen Ejecutivo (para quien lee esto en 90 segundos)

**Logify** es una plataforma SaaS de gestión logística end-to-end — pedidos, inventario, envíos y notificaciones en un solo sistema — construida como arquitectura de microservicios (4 servicios Node.js independientes + gateway + PostgreSQL), con un frontend PWA instalable y control de acceso diferenciado para **7 roles operativos reales** (dueño, operaciones, bodega, transportista, vendedor, soporte, cliente).

El diferenciador central del producto no es genérico: Logify resuelve un problema concreto de **última milla** — cómo probar, de forma verificable, que un pedido llegó a la persona correcta — con un mecanismo de doble factor (código único de cliente `SL-XXXXXX` + RUT del receptor) que el propio repartidor no puede ver ni falsificar. Esto es un detalle de diseño de producto, no un checkbox de feature list: fue pensado, implementado, y está cubierto por tests automatizados.

**Etapa actual:** MVP técnicamente completo, funcionando localmente vía Docker Compose, con **226 tests automatizados pasando** (medidos y verificados, no reportados de memoria) y una guía de despliegue a producción ya escrita. **No hay todavía clientes pagando, ni el sistema corriendo en producción real** — este documento no pretende decir lo contrario. Lo que sí hay es un producto de alcance completo, con decisiones de arquitectura documentadas (ver `design-artifacts/ADR/`), construido con una restricción de costos que en sí misma es una señal de eficiencia de capital: **el objetivo de infraestructura es US$0/mes** en plan gratuito de Render + Neon + Vercel, con los trade-offs de esa elección documentados con transparencia en [`RENDER_DEPLOY.md`](../../RENDER_DEPLOY.md) en vez de ocultados.

**La tesis para un inversionista o comprador potencial:** el riesgo técnico de "¿se puede construir esto?" ya está resuelto — el producto existe, corre, y tiene un roadmap de multi-tenancy SaaS con 3 de 5 fases ya implementadas y verificadas (ver sección 7). El riesgo que queda es el riesgo comercial — validar con clientes reales, un modelo de precios, y un canal de adquisición — que es exactamente el tipo de riesgo que el financiamiento buscado está destinado a reducir.

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
| Tests automatizados | **226 tests, todos pasando** (medido el 2026-07-19, no de memoria) | `aidlc-docs/testing/TEST_COVERAGE_REPORT.md` |
| Cobertura de código | Backend 28%-51% según servicio, Frontend 76% (por debajo de la meta interna declarada de 60% backend) | ídem |
| Arquitectura multi-tenant SaaS | 3 de 5 fases implementadas y **verificadas con un tenant de prueba real** (aislamiento de datos confirmado, reuso cruzado de token rechazado) | `wiki/Multi-Tenant.md` |
| Costo de infraestructura | Objetivo explícito de **US$0/mes** (Render + Neon + Vercel, planes free) — señal de eficiencia de capital, no de falta de ambición | `RENDER_DEPLOY.md` |
| Despliegue en producción real | **No** — hay guía y blueprint (`render.yaml`) listos, pero el checklist de producción en `RENDER_DEPLOY.md` está sin completar | `aidlc-docs/00_PROJECT_METADATA.md` |
| Clientes pagando | **Ninguno** — no hay evidencia de cliente real, piloto, ni ingreso en el repositorio | — |
| CI/CD automatizado | **No** — fue removido deliberadamente en una limpieza previa del repo; el despliegue depende del autodeploy nativo de Render/Vercel | `aidlc-docs/design-artifacts/ADR/ADR-003-no-cicd-platform-native-autodeploy.md` |
| Monitoreo/observabilidad en producción | **No implementado** — logging es un wrapper simple sin niveles ni correlación de requests | `aidlc-docs/operations/MONITORING_SETUP.md` |

**Cómo enmarcar esto en un pitch:** la narrativa honesta y defendible es *"riesgo técnico resuelto, riesgo comercial es exactamente lo que buscamos financiar."* Un producto MVP completo con 226 tests y una arquitectura multi-tenant ya parcialmente implementada es una posición fuerte comparada con un pitch deck sin código. Presentarlo como "ya listo para escalar a miles de clientes" sin mencionar la ausencia de monitoreo, CI/CD o clientes reales es el tipo de sobre-promesa que no sobrevive una diligencia técnica de 30 minutos.

---

## 7. Riesgos Conocidos (mejor documentarlos aquí que dejar que los descubra el inversionista)

Presentar proactivamente estos puntos en una conversación de financiamiento genera más confianza que ocultarlos — señala un equipo que conoce su propio producto en profundidad:

1. **Identidad de marca inconsistente:** el producto se llama "Logify" en README/wiki/dominio, pero la carpeta/repo raíz sigue llamándose "SmartLogix" — un detalle menor pero que un inversionista notará en los primeros 5 minutos de revisar el repo. Vale la pena resolverlo antes de cualquier presentación externa.
2. **Secreto JWT compartido sin rotación** entre los 4 microservicios — riesgo de seguridad documentado pero no mitigado.
3. **Sin rollback automático** en el flujo Saga de confirmación de pedido — fallas parciales se registran como advertencias, no se revierten solas.
4. **Sin política de retención/anonimización de datos personales** (RUT, contacto de clientes) — relevante de cara a compliance si se opera formalmente en Chile (Ley 19.628).
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

1. **Resolver la identidad de marca** (Logify vs. SmartLogix) — cosmético pero de alta visibilidad inmediata.
2. **Conseguir un piloto real**, aunque sea gratuito o con un solo cliente — nada reemplaza a un caso de uso real citable.
3. **Cerrar el checklist de `RENDER_DEPLOY.md`** y desplegar a producción real, aunque sea en el plan free — pasar de "puede desplegarse" a "está desplegado" cambia la conversación completamente.
4. **Definir estructura societaria y modelo de pricing** antes de la primera reunión formal con un inversionista.
5. **Añadir monitoreo básico** (aunque sea Render/Vercel logs + un uptime checker gratuito) para poder decir "está en producción y lo estamos observando", no solo "está desplegado".
6. **Preparar un pitch deck separado** que use este documento como fuente de verdad técnica, pero con el formato visual de una presentación de inversión (problema/solución/mercado/producto/equipo/ask) — este documento es la materia prima, no el documento para mostrar directamente a un inversionista.

---

## 10. Registro de Cambios de Esta Sección

- **2026-07-23:** Documento reescrito con enfoque en financiamiento/venta a solicitud explícita del equipo. Se preservó todo el contenido factual verificado de la versión anterior (roles, stakeholders internos, ausencia de stakeholders externos confirmados) y se añadieron las secciones 1, 4-9 orientadas a la narrativa de inversión. Ningún dato de tracción fue inventado; todo lo nuevo está explícitamente marcado como inferencia, opción de mercado, o pendiente de validación.
- **2026-07-19:** Versión original generada por auditoría AI-DLC inicial (ver `00_PROJECT_METADATA.md` para el detalle completo de esa auditoría).
