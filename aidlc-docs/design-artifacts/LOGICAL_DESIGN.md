# Logical Design

## Patterns Detectados en el Código

| Patrón | Dónde | Evidencia |
|---|---|---|
| **Database-per-Service** | Backend completo | 4 bases Postgres independientes: `orders_db`, `inventory_db`, `shipping_db`, `notification_db` |
| **BFF / API Gateway** | `Backend/nginx/` | Nginx enruta por prefijo de path (`/api/orders` → orders-service, etc.), único punto de entrada público (:8080) |
| **Saga (Orquestación, no coreografía)** | `orders-service`, endpoint `confirm` | orders-service actúa como orquestador explícito: llama a inventory-service, luego a shipping-service, en secuencia, vía `req.forwardedFetch` |
| **Repository (informal)** | Cada servicio | No hay clases Repository nombradas — son funciones con SQL parametrizado inline en `src/index.js`. Cumple la función pero no el patrón formal con interfaz |
| **Shared Kernel** | `Backend/shared/` | Módulo compartido (`app.js`, `auth.js`, `db.js`, `tenant.js`, `security.js`, `validate.js`, `shutdown.js`, `email.js`) montado como volumen Docker en los 4 servicios — evita duplicar código transversal, pero acopla el versionado de los 4 servicios a un único módulo compartido |
| **Idempotency Key** | `notification-service`, `inventory-service`/`shipping-service` (parcial) | Constraint único en `(tenant_id, event_id, audience)` para notificaciones; tabla `processed_events` en inventory/shipping existe pero está sin uso activo |
| **Defense in Depth (RBAC)** | Backend + Frontend | Enforcement server-side (`RESTRICTED_ROLES`, `requireRole`) es la fuente de verdad; el frontend oculta UI adicionalmente pero no es el mecanismo de seguridad real |
| **Two-Factor Server-Side Validation** | shipping-service | Confirmación de entrega requiere `client_code` + `RUT` cruzados contra otro servicio antes de aceptar el cambio de estado |
| **Multi-Tenancy: Shared Schema, Row-Level Isolation por Aplicación** | Todos los servicios | `tenant_id` en cada tabla + JWT como única fuente de verdad del tenant (no hay Postgres RLS nativo activado — el aislamiento es a nivel de código de aplicación, no de motor de base de datos, pese a que la wiki se titula "Seguridad y RLS") |
| **Graceful Shutdown** | `shared/shutdown.js` | SIGTERM/SIGINT cierran servidor HTTP + pool de conexiones antes de salir |
| **Component Composition (Frontend)** | `Frontend/src/components/` | Primitivas shadcn (`ui/`) compuestas en `common/`/`layout/`, sin librería de estado global — estado servido vía hooks (`useApiQuery`, etc.) |

⚠️ **Nota de precisión sobre "RLS":** el nombre `wiki/Seguridad-y-RLS.md` sugiere Row-Level Security nativo de PostgreSQL, pero el mecanismo real implementado es aislamiento a nivel de aplicación (filtrado por `tenant_id` en cada query), no políticas `CREATE POLICY` de Postgres. Es una distinción importante para cualquier auditoría de seguridad futura — RLS de aplicación es más frágil que RLS de motor de BD porque depende de que **cada** query nueva recuerde filtrar por tenant.

## Stack Tecnológico (detectado)

| Componente | Tecnología | Versión | Fuente |
|---|---|---|---|
| Runtime backend | Node.js | 22 | `Backend/*/Dockerfile` (`FROM node:22-alpine`) |
| Framework backend | Express | 4.21 | `Backend/*/package.json` |
| Driver de BD | `pg` (sin ORM) | 8.13 | `Backend/*/package.json` |
| Base de datos | PostgreSQL | 15 (Alpine) | `docker-compose.yml`, `Backend/postgres/Dockerfile` |
| Autenticación | `jsonwebtoken` + `bcryptjs` | 9.x | `Backend/orders-service/package.json` |
| Seguridad HTTP | `helmet`, `cors`, `express-rate-limit` | — | `Backend/shared/security.js` |
| Email | `nodemailer` | — | `Backend/shared/email.js` |
| Push notifications | `web-push` (VAPID) | — | `Backend/notification-service/package.json` |
| PDF | `pdfkit` | — | usado en los 4 servicios para reportes |
| Test backend | Jest 29 + Supertest 7 | — | `Backend/*/package.json` |
| Gateway | Nginx | Alpine | `Backend/nginx/Dockerfile` |
| Frontend framework | React | 18.3 | `Frontend/package.json` |
| Frontend build | Vite | 6 | `Frontend/package.json` |
| Frontend lenguaje | TypeScript | 5.7 | `Frontend/package.json` |
| UI components | shadcn/ui + `@base-ui/react` + Tailwind CSS | — | `Frontend/components.json`, `tailwind.config.ts` |
| Routing | react-router-dom | 6 | `Frontend/package.json` |
| PWA | vite-plugin-pwa (injectManifest) | — | `Frontend/vite.config.ts`, `Frontend/src/sw.ts` |
| Test frontend | Vitest 4 + React Testing Library + MSW | — | `Frontend/vite.config.ts` |
| Landing framework | Next.js (Pages Router) | 16.1.1 | `Landing/package.json` |
| Landing UI | React 19.2, Tailwind CSS 4, Sass, Swiper | — | `Landing/package.json` |
| Contenerización | Docker + Docker Compose | — | raíz del repo |
| Deploy backend | Render (Blueprint, free tier) | — | `render.yaml` |
| Deploy frontend/landing | Vercel | — | `Frontend/vercel.json`, `Landing/.vercel/` |
| Deploy BD | Neon (Postgres serverless, free tier) | — | `RENDER_DEPLOY.md` |

## Servicios Externos Detectados

| Servicio | Uso | Autenticación |
|---|---|---|
| Nominatim (OpenStreetMap) | Geocodificación de direcciones | Ninguna (API pública) |
| Open-Meteo | Clima actual, riesgo de entrega | Ninguna (API pública) |
| OSRM (Open Source Routing Machine) | Cálculo de rutas/distancias | Ninguna (instancia pública demo) |
| QR Server (goqr.me) | Generación de códigos QR | Ninguna |
| mindicador.cl | Indicadores económicos chilenos (UF/USD/UTM), cacheados 1h en memoria | Ninguna |
| Openverse | Búsqueda de imágenes de producto de licencia abierta | Ninguna |
| Neon (Postgres) | Base de datos en producción | Connection string (`DB_URL`) |
| SMTP (proveedor no especificado en código, configurable por env) | Envío de emails transaccionales, con modo demo/log si no hay credenciales | `SMTP_USER`/`SMTP_PASS` vía env |

⚠️ **Riesgo de diseño no documentado formalmente en el repo:** todas las integraciones externas anteriores son APIs públicas gratuitas sin autenticación ni SLA garantizado (Nominatim, Open-Meteo, OSRM demo instance en particular tienen políticas de uso justo que pueden bloquear tráfico de producción real). No hay circuit breakers ni fallback documentado si estas APIs fallan o dan rate-limit.
