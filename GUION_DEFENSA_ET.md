# Guion de Defensa Oral — Examen Transversal DSY1106

> Presentación: **15 min por equipo** + ronda de preguntas individuales.
> La defensa vale **70%** de la nota (7 indicadores de 10% c/u). El nivel máximo de cada indicador exige **ejemplos concretos de tu propio código** — no respuestas teóricas.

---

## ⚠️ Advertencia previa

El documento antiguo `SmartLogix.docx` hablaba de **EKS, SQS, Spring Data JPA y Resilience4j — nada de eso existe en el proyecto**. NO mencionar esas tecnologías en la defensa: una sola repregunta ("muéstrame el Circuit Breaker") las derriba. Todo lo de abajo está verificado contra el código real.

## Datos duros para tener en la cabeza

| Dato | Valor |
|---|---|
| Microservicios | 4: orders (8081), inventory (8082), shipping (8084), notification (8085) |
| Gateway | Nginx Alpine en 8080 (`Backend/nginx/nginx.conf`) |
| Base de datos | PostgreSQL 15, **4 bases separadas** (database-per-service) |
| Auth | JWT propio (jsonwebtoken) + bcryptjs, expiración 8h, 7 roles |
| Pruebas | **212 en total**: orders 60, inventory 45, shipping 28, notification 26, frontend 53 — todas en verde |
| Cobertura | Backend 30–46% (bajo el umbral 60% — reconocerlo como mejora), **Frontend 77%** |
| Branching | `main` (134 commits) + `develop` + ramas personales (`darlette`, `victor`), PRs #2–#4, Conventional Commits |
| CI/CD | GitHub Actions: `infra-deploy` (Terraform), `app-deploy` (ECS), `frontend-deploy` |
| Usuarios demo | admin/Admin123! · operaciones/Ops123! · bodega/Bodega123! · transportista/Trans123! · vendedor1/Vend123! · cliente/Cli123! |

---

## Estructura sugerida de los 15 minutos

1. **(2 min)** Caso de negocio + diagrama de arquitectura (wiki/Arquitectura.md).
2. **(5 min)** Demo en vivo: login → crear pedido → confirmar (mostrar stock descontado) → envío con tracking → notificación registrada → entrega validada con RUT.
3. **(3 min)** Código: la Saga en orders-service, `createApp()` compartido, un adaptador del frontend.
4. **(2 min)** Branching: historial de PRs en GitHub + pipelines verdes.
5. **(2 min)** Pruebas: correr `npm test` en vivo en un servicio + tabla de cobertura.
6. **(1 min)** Retrospectiva: 2 aciertos, 2 mejoras.

### Preparación antes de entrar (checklist)

```bash
# 1. Docker Desktop abierto, luego:
cd SmartLogix && docker compose up -d --build
# 2. Frontend:
cd Frontend && npm run dev     # http://localhost:3000
# 3. Smoke test:
curl http://localhost:8080/healthz
```

---

## Indicador 7 (10%) — Seguridad, privacidad, sostenibilidad y ética

**Pregunta probable:** *¿Cómo garantizan la seguridad y privacidad de los datos?*

- **Contraseñas:** hash con **bcryptjs factor 10**, nunca texto plano → `Backend/orders-service/src/index.js` (registro/login).
- **JWT:** firmado con `JWT_SECRET` inyectado por **variable de entorno** (docker-compose / SSM en AWS), nunca hardcodeado. Expira en 8h.
- **Privacidad por rol (RLS a nivel de aplicación):** el `client_code` (código de retiro) se **elimina de la respuesta** para roles shipper/vendor/customer. Ejemplo defendible: "un transportista no puede ver el código que valida la entrega, así no puede auto-validarse una entrega falsa".
- **Rate limiting + Helmet + CORS** en todos los servicios vía `Backend/shared/security.js` — mitiga fuerza bruta y abuso.
- **Ética/privacidad de datos:** minimización — solo se piden datos necesarios del cliente (nombre, RUT, contacto); el tracking público (`/api/orders/track/:code`) expone solo el estado, no datos personales.
- **Sostenibilidad:** imágenes Alpine, caché 1h de indicadores económicos (menos llamadas externas), PWA con precache (menos tráfico repetido).

**Repregunta típica:** *¿Dónde está el secreto JWT?* → "En una variable de entorno; en AWS lo inyecta SSM Parameter Store vía Terraform (`infra/ssm.tf`). En el repo solo está `.env.example` sin valores."

## Indicador 8 (10%) — Adaptabilidad y mantenibilidad

**Pregunta probable:** *¿Qué hace que su solución sea mantenible?*

- **Módulo compartido `Backend/shared/`**: un solo lugar para Express, pool PG, logging, seguridad. Agregar el 5º microservicio = `createApp('nueva_db', puerto)` + rutas.
- **Adaptadores en el frontend** (`api-adapters.ts`): cuando el backend agregó `image_url`, solo cambió el adaptador — las páginas no se tocaron.
- **TypeScript estricto** en el frontend: los contratos de la API están tipados (`types/api.ts` vs `types/domain.ts`).
- **Conventional Commits**: el historial es un changelog legible.

**Repregunta:** *Si mañana cambian PostgreSQL por otra BD, ¿qué se rompe?* → "El acceso está centralizado en `shared/db.js` (pool + reintentos); las consultas SQL viven en cada servicio, así que habría que adaptar las queries, pero la configuración/conexión cambia en un solo archivo. Reconocemos que un repositorio por entidad lo haría aún más limpio — está en nuestras mejoras propuestas."

## Indicador 9 (10%) — Adaptabilidad demostrada CON CÓDIGO

**Prepara estos 3 fragmentos abiertos en pestañas del editor:**

1. `Backend/shared/app.js` → `createApp()`: "los 4 servicios nacen de esta factoría; este es el punto de extensión".
2. `Frontend/src/lib/api-adapters.ts` → `adaptInventory()`: "aísla al frontend del formato del backend".
3. `Backend/notification-service/src/index.js` → `broadcastPush()`: "agregamos notificaciones Web Push **sin tocar los otros servicios** — evidencia de bajo acoplamiento".

**Frase clave:** "La prueba de adaptabilidad es histórica: en la última semana agregamos push, indicadores económicos e imágenes de producto y ningún otro servicio requirió cambios."

## Indicador 10 (10%) — Arquetipos y patrones arquitectónicos

**Los 6 patrones REALES del proyecto (con ubicación):**

| Patrón | Dónde | Para qué |
|---|---|---|
| **API Gateway** | `Backend/nginx/nginx.conf` | Punto único de entrada, enruta por prefijo, oculta servicios internos |
| **Database-per-service** | `docker-compose.yml` + `init-db.sql` | 4 BDs aisladas; ningún servicio lee tablas de otro |
| **Saga orquestada** | `orders-service` (confirm) | Confirmar pedido = descontar stock + crear envío + actualizar estado; fallos parciales → `warnings` |
| **Factory Method** | `Backend/shared/app.js` | `createApp()` fabrica el esqueleto Express de cada servicio |
| **Consumidor idempotente** | `notification-service` | `event_id` UNIQUE + respuesta 409 DUPLICATE — un evento no se procesa dos veces |
| **Adapter** | `Frontend/src/lib/api-adapters.ts` | snake_case (API) → camelCase (dominio UI) |

**Repregunta:** *¿Por qué no usaron mensajería asíncrona?* → "Evaluamos el trade-off: una cola daría reintentos automáticos, pero agrega infraestructura y complejidad operacional. Para el volumen de una PYME, la Saga síncrona con campo `warnings` es suficiente y más trazable. La idempotencia por `event_id` ya está implementada, así que migrar a eventos sería incremental."

## Indicador 11 (10%) — Estrategia de branching

**Pregunta probable:** *¿Cómo se organizaron con Git?*

- Flujo: `main` estable + `develop` + **ramas personales** (`darlette`, `victor`) → **Pull Requests** (#2, #3, #4 visibles en GitHub) → merge a `main`.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`) — mostrar `git log --oneline` en vivo.
- Cada merge a `main` dispara **GitHub Actions**: Terraform (infra), build+deploy de servicios a ECS, build+deploy del frontend. "El branching no es cosmético: main desplegable siempre".
- **Honestidad retrospectiva** (suma puntos): "hacia el final integramos directo a main por velocidad; con más tiempo usaríamos ramas por feature de vida corta y protección de main con revisión obligatoria".

## Indicador 12 (10%) — Escalabilidad y funcionalidad de microservicios

**Pregunta probable:** *¿Cómo escala su solución?*

- **Servicios stateless**: el estado vive en PostgreSQL; el JWT viaja en cada request → se puede replicar cualquier servicio detrás del gateway sin sesiones pegajosas.
- **Escalado selectivo**: en Cyber Monday se replica solo `orders-service` e `inventory-service`; `notification-service` no necesita réplicas. Eso es imposible en un monolito.
- **Nginx como balanceador natural**: el `proxy_pass` puede apuntar a N réplicas (en ECS, el service discovery hace esto).
- **Aislamiento de fallos**: si notification cae, los pedidos siguen funcionando (la Saga lo reporta en `warnings`).
- **Funcionalidad**: demo del flujo completo = evidencia de que la separación no rompió la experiencia de negocio.

## Indicador 13 (10%) — Pruebas unitarias y resultados

**Pregunta probable:** *¿Qué prueban y qué cobertura lograron?*

- **212 pruebas** (Jest+Supertest backend, Vitest+RTL frontend), todas en verde. Correr en vivo: `cd Backend/orders-service && npm test`.
- **La prueba estrella** (mostrarla): RLS por rol en orders —
  *"owner recibe `client_code`, shipper NO lo recibe"* — protege la regla de privacidad más crítica contra regresiones.
- Frontend: pruebas de **RBAC** (`isPathAllowedForRole`, `hasPermission`) y adaptadores.
- **Cobertura honesta**: frontend 77%; backend 30–46%, bajo el umbral del 60% que nos fijamos. Por qué: las últimas features (push, indicadores, QR) entraron con verificación E2E pero sin unit tests. **Plan**: mocks de dependencias externas (fetch), pruebas de caminos de error, y gate de cobertura en CI que haga fallar el pipeline.
- **Newman/Postman** (`ENTREGABLE/`): verificación de contrato de toda la API tras cada despliegue.

**Repregunta:** *¿Por qué confiar en el sistema con 40% de cobertura?* → "Porque la cobertura mide líneas, no riesgo: priorizamos las rutas críticas del negocio (crear/confirmar/cancelar pedido, RLS, stock). Las 212 pruebas cubren los flujos que mueven dinero y datos personales. Dicho eso, el número debe subir y sabemos exactamente cómo."

---

## Preguntas transversales de comunicación frontend–backend

*¿Cómo se comunica el frontend con el backend?*
→ "El `ApiClient` (`Frontend/src/lib/api-client.ts`) centraliza todo: adjunta el JWT en `Authorization: Bearer`, renueva la sesión deduplicando refreshes concurrentes, maneja errores 401/403 globalmente y expone `fetchBlob()` para binarios (PDF/QR). En dev, el proxy de Vite manda `/api` al gateway; en prod, rewrites de Vercel."

*¿Qué pasa si dos servicios necesitan el mismo dato?*
→ "Nunca comparten BD: se piden los datos por REST con `interServiceFetch()`. Ejemplo real: shipping valida la entrega consultando a orders el `client_code` y el RUT del cliente."

*¿Cómo manejan un fallo de un microservicio?*
→ "Gateway devuelve 502 solo para ese prefijo; el resto sigue operativo. En la Saga, el fallo parcial queda en `warnings`. El frontend muestra error amigable y la PWA mantiene la app cargada."

---

## Reparto sugerido por integrante

Cada uno debe poder explicar TODO, pero para profundidad:

- **Jonathan:** arquitectura, Saga, gateway, CI/CD, push notifications.
- **Darlette:** frontend (ApiClient, adaptadores, RBAC, PWA), pruebas Vitest.
- **Víctor:** shipping/entrega validada, pruebas Jest, branching y PRs.

*(Ajustar según quién hizo qué realmente — el docente puede preguntar por commits individuales.)*
