# Despliegue de Logify en Railway

Guía paso a paso para llevar los 4 microservicios + gateway + base de datos a
Railway. El Frontend y la Landing se quedan en Vercel (ya desplegados); aquí
solo cambia a qué URL apuntan.

Los pasos que requieren crear cuenta, conectar el repo de GitHub o ingresar
método de pago debes hacerlos tú directamente en el dashboard de Railway —
esta guía te da el orden exacto y los valores a copiar.

## Arquitectura resultante

```
Vercel (Frontend React)  ─┐
Vercel (Landing Next.js) ─┼─▶  api-gateway (nginx, Railway, dominio público)
                           │        │
                           │        ├─▶ orders-service        (privado :8081)
                           │        ├─▶ inventory-service      (privado :8082)
                           │        ├─▶ shipping-service       (privado :8084)
                           │        └─▶ notification-service   (privado :8085)
                           │                 │
                           └─────────────────┴─▶ Postgres (plugin Railway, 1 instancia, 4 DBs)
```

Solo el `api-gateway` tiene dominio público. Los 4 microservicios se
comunican entre sí y con nginx por **red privada de Railway**
(`<servicio>.railway.internal`), igual que hoy lo hacen por la red Docker
`logify-net` en local.

## Prerrequisitos

- Cuenta en [railway.app](https://railway.app) (tú la creas — no puedo hacerlo por ti)
- Repo de Logify en GitHub, con estos cambios ya commiteados:
  - `Backend/nginx/nginx-railway.conf.template`
  - `Backend/nginx/docker-entrypoint-railway.sh`
  - `Backend/nginx/Dockerfile.railway`
- Un valor random fuerte para `JWT_SECRET` (por ejemplo `openssl rand -hex 32`)

## Paso 1 — Crear el proyecto y la base de datos

1. En Railway: **New Project → Empty Project**.
2. Dentro del proyecto: **New → Database → Add PostgreSQL**. Railway crea el
   plugin y expone `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `DATABASE_URL`.
3. Conéctate una vez (pestaña **Data**, o `railway connect postgres` con la
   CLI) y corre en orden:
   - `Backend/init-db.sql` (crea `orders_db`, `inventory_db`, `shipping_db`, `notification_db`)
   - `Backend/stored-procedures.sql`
   - `Backend/seed.sql` (opcional, solo si quieres datos de prueba)

## Paso 2 — Crear los 4 microservicios

Repite esto 4 veces (`orders-service`, `inventory-service`, `shipping-service`,
`notification-service`):

1. **New → GitHub Repo** → selecciona el repo de Logify.
2. En **Settings** del servicio:
   - **Root Directory:** `Logify/Backend`
   - **Dockerfile Path:** `orders-service/Dockerfile` (ajusta el nombre de carpeta según el servicio)
   - **Networking:** no expongas dominio público en estos 4 — solo necesitan
     red privada. Activa **Private Networking** (viene activo por defecto en
     proyectos nuevos).
3. En **Variables**, pega el bloque correspondiente de
   `Backend/.env.railway.example`. Sustituye los placeholders `__...__` por
   valores reales; `JWT_SECRET` debe ser **idéntico** en los 4 servicios
   (todos firman/verifican el mismo token).
4. Deploy. Verifica el healthcheck en cada servicio: `GET /health` debe responder 200.

## Paso 3 — Crear el API Gateway (nginx)

1. **New → GitHub Repo** → mismo repo.
2. **Settings**:
   - **Root Directory:** `Logify/Backend/nginx`
   - **Dockerfile Path:** `Dockerfile.railway`
   - **Networking → Target Port:** `8080`
   - **Networking → Generate Domain** (esto te da la URL pública, algo como
     `logify-gateway-production.up.railway.app`)
3. En **Variables**, pega el bloque `api-gateway` de `.env.railway.example`
   (las 4 URLs internas apuntando a `RAILWAY_PRIVATE_DOMAIN` de cada servicio).
4. Deploy. Prueba `https://<tu-dominio-gateway>/healthz` → debe responder
   `{"status":"UP",...}`.
5. Prueba una ruta real, por ejemplo `https://<tu-dominio-gateway>/api/orders`
   (debe responder 401/403 sin token, no 502/504 — eso confirma que nginx
   está alcanzando orders-service correctamente).

## Paso 4 — Apuntar Frontend y Landing al nuevo gateway

En Vercel, en los proyectos **Frontend** y **Landing**, actualiza las
variables de entorno:

- Frontend (`VITE_API_BASE_URL`): `https://<tu-dominio-gateway>`
- Landing: si consume la API, la variable equivalente (`NEXT_PUBLIC_API_URL` o similar)

Redeploy ambos en Vercel para que tomen la variable nueva.

## Paso 5 — CORS

Actualiza `ALLOWED_ORIGINS` en los 4 microservicios (Railway → Variables) con
los dominios reales de Vercel, separados por coma, sin `*`:

```
ALLOWED_ORIGINS=https://logify.vercel.app,https://logify-landing.vercel.app
```

## Paso 6 — CI/CD

Tienes dos opciones; decide antes de dejarlo en piloto automático:

- **Railway nativo (recomendado para esta variante):** cada servicio ya
  quedó conectado al repo de GitHub — Railway redeploya solo en cada push a
  `main`. Puedes desactivar/borrar el workflow de ECS (`.github/workflows/deploy.yml`)
  o dejarlo apagado si no vas a usar AWS en paralelo.
- **Mantener GitHub Actions:** cambiar el workflow para que en vez de
  publicar en ECR/ECS dispare `railway up` por servicio con la Railway CLI y
  un token de proyecto guardado en secrets de GitHub.

## Paso 7 — Checklist antes de considerarlo "producción"

- [ ] `JWT_SECRET` cambiado a un valor random fuerte (no el default del repo)
- [ ] `ALLOWED_ORIGINS` con dominios reales, no `*`
- [ ] Healthcheck OK en los 4 servicios + gateway
- [ ] Backups automáticos del plugin Postgres activados (Railway → plugin → Settings → Backups)
- [ ] SMTP configurado si vas a enviar correos reales (si no, queda en modo demo/consola)
- [ ] VAPID keys generadas (`npx web-push generate-vapid-keys`) si usarás Web Push
- [ ] Variables `.env` reales del repo local NO están commiteadas (verificar `.gitignore`)

## Costos aproximados

Railway cobra por uso (CPU/RAM/red), no por servicio fijo. Con 5 servicios
pequeños (4 Node + nginx) + 1 Postgres corriendo 24/7, un estimado inicial
razonable es **US$15–30/mes** en el plan Hobby/Pro, dependiendo de tráfico y
memoria asignada. Revisa el estimador en Railway antes de confirmar.
