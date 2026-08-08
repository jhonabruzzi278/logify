# Architecture Overview

## Estructura del Proyecto

```
Logify/ (repo raíz)
├── Frontend/                   # React 18 SPA + PWA (Vite 6), UI operativa por rol
│   └── src/
│       ├── app/                 # auth.tsx (contexto+guard RBAC), router.tsx, access.ts
│       ├── components/          # common/ layout/ ui/ (shadcn)
│       ├── hooks/                # useApiQuery, usePermissions, useOperationalWorkspace...
│       ├── lib/                  # api-client (JWT+refresh), adapters, offline queue, push
│       ├── pages/                # 20+ páginas, una por vista/rol
│       ├── sw.ts                 # Service worker (precache + push)
│       └── types/                # api.ts (snake_case backend), domain.ts (camelCase UI)
├── Backend/
│   ├── orders-service/          # :8081 — pedidos, clientes, auth JWT, Saga orquestador, RLS
│   ├── inventory-service/       # :8082 — stock, ventas POS, reportes, indicadores
│   ├── shipping-service/        # :8084 — envíos, tracking, validación de entrega 2FA
│   ├── notification-service/    # :8085 — trazabilidad, alertas, Web Push
│   ├── nginx/                   # API Gateway / BFF :8080, reverse proxy por prefijo
│   ├── shared/                  # Módulo compartido: app, auth, db, tenant, security, validate, email, shutdown
│   ├── postgres/                # Dockerfile custom de Postgres
│   ├── init-db.sql, stored-procedures.sql, seed.sql
│   └── README.md
├── Landing/                     # Next.js (Pages Router) — sitio de marketing público
├── wiki/                        # Documentación técnica existente (español) — arquitectura, RBAC, seguridad, multi-tenant, pruebas
├── docs/
│   ├── technical/                # HTML: arquitectura, persistencia, informe de pruebas
│   └── api/                      # Colección Postman con 16 carpetas (CRUD + 5 flujos E2E)
├── aidlc-docs/                  # ← Esta carpeta (generada por esta auditoría)
├── docker-compose.yml           # Orquestación local completa (6 contenedores)
├── render.yaml                  # Blueprint de despliegue Render (5 servicios web)
└── RENDER_DEPLOY.md             # Runbook de despliegue paso a paso (Render+Neon+Vercel)
```

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────┐
│  Frontend  React 18 + TypeScript + Vite   :3000     │  ← PWA instalable, RBAC client-side
└──────────────────────┬──────────────────────────────┘
                        │ /api/*  (proxy Vite en dev / vercel.json en prod)
┌───────────────────────▼──────────────────────────────┐
│  API Gateway / BFF   Nginx Alpine          :8080      │  ← único punto de entrada público
└──────┬───────────┬──────────────┬────────────────────┘
       │           │              │
┌──────▼──┐  ┌────▼────┐  ┌──────▼──┐  ┌──────────────┐
│ orders  │  │inventory│  │shipping │  │notification  │
│ :8081   │  │ :8082   │  │ :8084   │  │   :8085      │
│ (Saga   │  │         │  │ (2FA    │  │ (event sink) │
│  orch.) │  │         │  │ delivery│  │              │
└──────┬──┘  └────┬────┘  └──────┬──┘  └──────────────┘
       │           │              │
┌──────▼───────────▼──────────────▼────────────────────┐
│          PostgreSQL 15  (4 bases independientes)      │
│  orders_db  inventory_db  shipping_db  notification_db│
└────────────────────────────────────────────────────────┘

Landing (Next.js, Vercel) — sitio de marketing independiente, sin llamadas al backend detectadas más allá de posible NEXT_PUBLIC_API_URL.
```

Todos los servicios comparten `Backend/shared/` (montado como volumen Docker), evitando duplicación de lógica transversal (auth, validación, seguridad, DB pool, apagado ordenado) — ver `design-artifacts/LOGICAL_DESIGN.md` para el detalle de patrón "Shared Kernel".

## Flujo Saga (confirmación de pedido)

```
Cliente/ops → orders-service PUT /orders/:id/confirm
                │
                ├─ 1. POST inventory-service /:sku/adjust?delta=-N   (descuenta stock)
                ├─ 2. POST shipping-service /shipments                (crea envío, TRACK-XXXXXXXX)
                └─ 3. UPDATE orders SET status='EN_PREPARACION'

Fallos parciales → registrados en campo `warnings` de la respuesta,
                    el pedido avanza igual (sin rollback automático).
```

## Flujo de validación de entrega (2 factores)

```
shipper → shipping-service PUT /shipments/:id/stage?stage=ENTREGADO
             │  body: { customerCode, recipientRut, proofOfDeliveryImage }
             │
             ├─ GET orders-service /orders/:id      → verificar client_code == customerCode
             ├─ GET orders-service /customers/:id   → verificar rut == recipientRut
             │
             └─ si ambos coinciden → UPDATE shipment stage=ENTREGADO + POST notification-service
                si no coinciden    → 400, estado sin cambios
```

## Tech Stack

Ver tabla completa en [`LOGICAL_DESIGN.md`](./LOGICAL_DESIGN.md). Resumen de capa:

| Layer | Tech | Justificación (inferida) | Fuente |
|---|---|---|---|
| Presentación (app operativa) | React 18 + TS + Vite + shadcn/ui | Stack moderno, DX rápida, componentes accesibles por defecto (Radix vía shadcn) | `Frontend/package.json` |
| Presentación (marketing) | Next.js 16 (Pages Router) | Template comprado/adaptado para landing rápida con SEO out-of-the-box | `Landing/package.json`, nombres de componentes tipo `Hero1`, `Cta1` sugieren theme comercial |
| Gateway | Nginx | Estándar de la industria, ligero, config declarativa simple para reverse proxy | `Backend/nginx/` |
| Backend | Node.js + Express, sin framework "enterprise" (no NestJS/Fastify) | Curva de aprendizaje baja, consistente con equipo pequeño/académico | `Backend/*/package.json` |
| Persistencia | PostgreSQL, SQL crudo (sin ORM), stored procedures para operaciones atómicas críticas | Control fino sobre transacciones/locking (`SELECT FOR UPDATE`) que un ORM complicaría; trade-off: más código boilerplate, sin migraciones versionadas formales (usa `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` idempotente en vez de un migrator como Prisma/Knex) | `Backend/shared/db.js`, `stored-procedures.sql` |
| Comunicación inter-servicio | HTTP síncrono (sin broker) | Simplicidad para el tamaño del equipo/proyecto; trade-off: acopla disponibilidad de servicios entre sí, sin tolerancia a fallos parciales real | Confirmado ausencia de RabbitMQ/Kafka/Redis en todo el codebase |
| Auth | JWT propio + bcrypt (post-migración desde AWS Cognito) | Reduce dependencia de infraestructura externa/costos AWS; trade-off: gestión manual de secretos y sin MFA/social login | Commits `4b6dd3b`, `dee6cf0` |
| Deploy | VPS propio con Docker/Caddy/PostgreSQL para backend + Vercel para Frontend/Landing | Control operativo, TLS automático y costo fijo bajo | `wiki/Despliegue-VPS.md` |

## Decisiones Arquitectónicas Detectadas

- **Monolito vs Microservicios:** microservicios reales (4 servicios independientes, cada uno con su propia BD y despliegue), no un "monolito distribuido" — no hay tablas ni código compartido entre bases de datos.
- **Sync vs Async:** 100% síncrono entre servicios (HTTP REST). No hay mensajería asíncrona pese a que el esquema de BD (`processed_events`) sugiere que se planeó en algún momento.
- **Multi-tenant, shared-schema:** una única instancia de cada servicio/BD sirve a todos los tenants, aislados por columna `tenant_id`, no bases de datos separadas por tenant ni Postgres RLS nativo.
- **BFF/Gateway centralizado:** todo el tráfico externo pasa por Nginx — los microservicios no son accesibles públicamente de forma directa (mitigado también por CORS/rate-limit en cada uno como defensa adicional).
- **CI/CD con gate obligatorio:** GitHub Actions ejecuta tests/builds en cada PR; `main` exige seis checks verdes. Después del merge, Vercel despliega Frontend/Landing y el workflow de CD despliega el backend al VPS con health check y rollback. El ADR-003 conserva la decisión histórica que fue superada.

Ver decisiones individuales con contexto y consecuencias en [`ADR/`](./ADR/).
