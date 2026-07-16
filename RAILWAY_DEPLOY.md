# Despliegue de Logify a producción

Guía completa, de cero, para: backend en Railway, Frontend y Landing en
Vercel, y conectar el dominio propio `logify.cl` (comprado en DonDominio).

Los pasos que requieren crear cuenta, conectar el repo de GitHub, ingresar
método de pago o tocar el panel DNS de tu registrador debes hacerlos tú
directamente — esta guía te da el orden exacto, qué click hacer y qué
valores copiar.

**Sigue las partes en orden.** Cada una depende de la anterior.

## Arquitectura resultante

```
logify.cl, www.logify.cl        → Vercel (Landing, Next.js)
<empresa>.logify.cl (wildcard)  → Vercel (Frontend, React/Vite)
api.logify.cl                   → Railway (api-gateway / nginx)
                                        │
                                        ├─▶ orders-service        (privado :8081)
                                        ├─▶ inventory-service      (privado :8082)
                                        ├─▶ shipping-service       (privado :8084)
                                        └─▶ notification-service   (privado :8085)
                                               │
                                               └─▶ Postgres (plugin Railway, 1 instancia, 4 DBs)
```

Solo el `api-gateway` tiene dominio público en Railway — los 4
microservicios se comunican entre sí por **red privada**
(`<servicio>.railway.internal`). El frontend en `*.logify.cl` llama siempre
al mismo `api.logify.cl`, sin importar el subdominio del tenant (ver
[wiki/Multi-Tenant.md](wiki/Multi-Tenant.md) para el porqué de este diseño).

## Prerrequisitos

- Cuenta en [railway.app](https://railway.app)
- Cuenta en [vercel.com](https://vercel.com)
- Acceso al panel de DNS de tu dominio en DonDominio
- Repo `jhonabruzzi278/logify` en GitHub, actualizado (`git push` ya hecho)
- Un valor random fuerte para `JWT_SECRET` (ej. `openssl rand -hex 32`, o pídemelo y te ayudo a generarlo)

---

## Parte A — Backend en Railway

### A.1 — Proyecto y base de datos

1. En Railway: **New Project → Empty Project**.
2. Dentro del proyecto: **New → Database → Add PostgreSQL**. Railway crea el
   plugin y expone `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `DATABASE_URL`.
3. Conéctate una vez (pestaña **Data**, o `railway connect postgres` con la
   CLI) y corre en orden:
   - `Backend/init-db.sql` (crea `orders_db`, `inventory_db`, `shipping_db`, `notification_db`)
   - `Backend/stored-procedures.sql`
   - `Backend/seed.sql` (opcional, solo si quieres datos de prueba)

### A.2 — Los 4 microservicios

Repite esto 4 veces (`orders-service`, `inventory-service`, `shipping-service`,
`notification-service`):

1. **New → GitHub Repo** → selecciona el repo de Logify.
2. En **Settings** del servicio:
   - **Root Directory:** `Backend`
   - **Dockerfile Path:** `orders-service/Dockerfile` (ajusta el nombre de carpeta según el servicio)
   - **Networking:** no expongas dominio público en estos 4 — solo necesitan
     red privada (viene activa por defecto en proyectos nuevos).
3. En **Variables**, pega el bloque correspondiente de
   `Backend/.env.railway.example`. Sustituye los placeholders `__...__` por
   valores reales; `JWT_SECRET` debe ser **idéntico** en los 4 servicios
   (todos firman/verifican el mismo token). Deja `ALLOWED_ORIGINS` y
   `APP_URL` con los placeholders por ahora — se completan en la Parte D.
4. Deploy. Verifica el healthcheck en cada servicio: `GET /health` debe responder 200.

### A.3 — API Gateway (nginx)

1. **New → GitHub Repo** → mismo repo.
2. **Settings**:
   - **Root Directory:** `Backend/nginx`
   - **Dockerfile Path:** `Dockerfile.railway`
   - **Networking → Target Port:** `8080`
   - **Networking → Generate Domain** (esto te da una URL temporal tipo
     `logify-gateway-production.up.railway.app` — la usarás para probar antes
     de conectar `api.logify.cl`)
3. En **Variables**, pega el bloque `api-gateway` de `.env.railway.example`
   (las 4 URLs internas apuntando a `RAILWAY_PRIVATE_DOMAIN` de cada servicio).
4. Deploy. Prueba `https://<tu-dominio-temporal>/healthz` → debe responder
   `{"status":"UP",...}`.
5. Prueba `https://<tu-dominio-temporal>/api/orders` (debe responder
   401/403 sin token, no 502/504 — confirma que nginx alcanza orders-service).

---

## Parte B — Frontend (React/Vite) en Vercel

1. En Vercel: **Add New → Project → Import Git Repository** → selecciona el repo de Logify.
2. **Root Directory:** `Frontend`. Vercel detecta Vite automáticamente
   (build command `vite build`, output `dist`) — no hace falta tocar nada ahí.
3. **Environment Variables**, agrega:
   - `VITE_API_BASE_URL` = la URL temporal del gateway de Railway (Parte A.3), ej.
     `https://logify-gateway-production.up.railway.app`. La cambiarás a
     `https://api.logify.cl` en la Parte D.
4. **Deploy**. Te da una URL `https://<algo>.vercel.app` — pruébala: login con
   un usuario demo (`admin` / `Admin123!`) debe funcionar.

## Parte C — Landing (Next.js) en Vercel

1. En Vercel: **Add New → Project → Import Git Repository** → mismo repo,
   proyecto **separado** del Frontend.
2. **Root Directory:** `Landing`. Vercel detecta Next.js automáticamente.
3. Si la Landing consume la API en algún punto (formulario de contacto,
   futuro signup de tenants), agrega la variable de entorno equivalente
   (`NEXT_PUBLIC_API_URL` o como se llame en tu código) apuntando al mismo
   gateway temporal de Railway.
4. **Deploy**. Verifica la URL `https://<algo>.vercel.app`.

---

## Parte D — Conectar logify.cl

Aquí se conecta todo: los 3 dominios (Landing, Frontend wildcard, API) al
dominio real. El orden importa: primero agregas el dominio en Vercel/Railway
(te dan el valor DNS exacto a usar), después vas a DonDominio a crear el
registro.

### D.1 — Landing: `logify.cl` + `www.logify.cl`

1. En el proyecto **Landing** de Vercel → **Settings → Domains** → agrega `logify.cl`.
2. Vercel te va a pedir dos registros (los nombres exactos los muestra su
   panel, pero típicamente son):
   - Para el dominio raíz (`logify.cl`, sin subdominio): registro **A** →
     `76.76.21.21`
   - Para `www.logify.cl`: registro **CNAME** → `cname.vercel-dns.com`
3. Agrega también `www.logify.cl` como dominio en el mismo proyecto Vercel
   (con la opción de redirigir a `logify.cl` o al revés, tú eliges cuál es el canónico).
4. En DonDominio → panel DNS de `logify.cl` → crea esos dos registros con
   los valores exactos que te mostró Vercel.

### D.2 — Frontend: `*.logify.cl` (wildcard, un subdominio por empresa)

1. En el proyecto **Frontend** de Vercel → **Settings → Domains** → agrega `*.logify.cl`.
2. Vercel te da un registro **CNAME**: `*` → `cname.vercel-dns.com`.
3. En DonDominio, crea ese registro CNAME con host `*` apuntando a ese valor.

> **Nota de plan:** los dominios wildcard en Vercel pueden requerir un plan
> de pago (Pro) para el certificado SSL automático — si al agregar `*.logify.cl`
> Vercel te pide upgrade, es normal, no es un error tuyo ni mío. Si prefieres
> no pagar todavía, puedes arrancar agregando subdominios concretos uno por
> uno (`acme.logify.cl`, etc.) en el plan gratuito mientras validas el negocio,
> y pasar a wildcard cuando tengas más tenants.

### D.3 — API: `api.logify.cl`

1. En Railway, en el servicio **api-gateway** → **Settings → Networking → Custom Domain** → agrega `api.logify.cl`.
2. Railway te da un registro **CNAME** específico (algo como `xxxx.up.railway.app` o similar — usa el valor exacto que te muestre).
3. En DonDominio, crea ese CNAME con host `api` apuntando a ese valor.

### D.4 — Esperar propagación

Los registros DNS pueden tardar desde minutos hasta ~24h en propagarse.
Verifica con:

```bash
curl -I https://api.logify.cl/healthz
curl -I https://logify.cl
```

Ambos deben responder `200` con certificado válido (Vercel y Railway emiten
el SSL automáticamente vía Let's Encrypt una vez que detectan el DNS correcto
— no tienes que hacer nada manual para el certificado).

---

## Parte E — Actualizar variables con el dominio real

Una vez que `api.logify.cl` responde:

**En Railway, en los 4 microservicios** (Variables):
```
ALLOWED_ORIGINS=https://logify.cl,https://www.logify.cl,https://*.logify.cl
APP_URL=https://logify.cl
```
> Si tu middleware de CORS no soporta wildcard en `ALLOWED_ORIGINS`, dímelo y
> ajustamos `Backend/shared/security.js` para matchear `*.logify.cl` por regex
> en vez de por lista exacta — con subdominio por tenant, la lista de
> orígenes exactos crece con cada empresa nueva y no escala.

**En Vercel, proyecto Frontend** (Environment Variables):
```
VITE_API_BASE_URL=https://api.logify.cl
```

**En Vercel, proyecto Landing** (si aplica):
```
NEXT_PUBLIC_API_URL=https://api.logify.cl
```

Redeploy los 3 proyectos de Vercel (o simplemente vuelve a hacer push a
`main`, ya que están conectados a GitHub) y reinicia los 4 servicios de
Railway para que tomen las variables nuevas.

---

## Parte F — CI/CD

Tanto Railway como Vercel quedan conectados directo al repo de GitHub: cada
push a `main` dispara redeploy automático en los 5 servicios de Railway y en
los 2 proyectos de Vercel. No necesitas GitHub Actions para esto.

---

## Checklist antes de considerarlo "producción"

- [ ] `JWT_SECRET` es un valor random fuerte (no el default del repo), igual en los 4 servicios
- [ ] `ALLOWED_ORIGINS` con dominios reales de `logify.cl`, no `*`
- [ ] Healthcheck OK en los 4 servicios + gateway, con el dominio final
- [ ] `https://logify.cl`, `https://www.logify.cl`, `https://api.logify.cl` responden con certificado válido
- [ ] Backups automáticos del plugin Postgres activados (Railway → plugin → Settings → Backups)
- [ ] SMTP configurado si vas a enviar correos reales (si no, queda en modo demo/consola)
- [ ] VAPID keys generadas (`npx web-push generate-vapid-keys`) si usarás Web Push
- [ ] Variables `.env` reales del repo local NO están commiteadas (verificar `.gitignore`)
- [ ] Probado un login real desde `https://logify.cl` de punta a punta (no solo desde `*.vercel.app`)

## Costos aproximados

- **Railway:** cobra por uso (CPU/RAM/red). Con 5 servicios pequeños (4 Node
  + nginx) + 1 Postgres corriendo 24/7, estimado inicial **US$15–30/mes**.
- **Vercel:** el plan Hobby (gratis) alcanza para Landing + Frontend sin
  wildcard. Si necesitas `*.logify.cl` con SSL automático, revisa si tu plan
  actual lo soporta o si requiere Pro (~US$20/mes).
- **DonDominio:** el dominio `.cl` ya está pagado (renovación anual aparte).
