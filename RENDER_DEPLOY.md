# Despliegue de Logify a producción (gratis)

Guía completa, de cero, para: backend en Render (plan free) + base de datos en
Neon (free), Frontend y Landing en Vercel, y conectar el dominio propio
`logify.cl` (comprado en DonDominio). Todo el stack queda en **US$0/mes**,
con las limitaciones de los planes gratuitos explicadas en cada parte.

Los pasos que requieren crear cuenta, conectar el repo de GitHub o tocar el
panel DNS de tu registrador debes hacerlos tú directamente — esta guía te da
el orden exacto, qué click hacer y qué valores copiar.

**Sigue las partes en orden.** Cada una depende de la anterior.

## Por qué esta arquitectura (y no la de Railway/DigitalOcean)

Render **no ofrece red privada real en el plan free**: un "web service"
gratis puede *enviar* tráfico interno pero no puede *recibirlo* (eso requiere
un "private service", de pago). Por eso, a diferencia de las guías
anteriores (Railway, DigitalOcean), aquí los 5 componentes del backend se
comunican entre sí por su **URL pública** (`https://<servicio>.onrender.com`),
protegida igual por JWT + CORS, pero técnicamente alcanzable si alguien
adivina la URL. Es la única forma de que el backend completo cueste $0.

## Arquitectura resultante

```
logify.cl, www.logify.cl        → Vercel (Landing, Next.js)
<empresa>.logify.cl (wildcard)  → Vercel (Frontend, React/Vite)
api.logify.cl                   → Render (api-gateway / nginx, free)
                                        │  (llamadas por HTTPS público, no red privada)
                                        ├─▶ orders-service        (Render, free)
                                        ├─▶ inventory-service      (Render, free)
                                        ├─▶ shipping-service       (Render, free)
                                        └─▶ notification-service   (Render, free)
                                               │
                                               └─▶ Postgres (Neon, free, 1 proyecto, 4 DBs)
```

## Prerrequisitos

- Cuenta en [render.com](https://render.com) (no pide tarjeta para el plan free)
- Cuenta en [neon.tech](https://neon.tech) (no pide tarjeta para el plan free)
- Cuenta en [vercel.com](https://vercel.com)
- Acceso al panel de DNS de tu dominio en DonDominio
- Repo `jhonabruzzi278/logify` en GitHub, actualizado (`git push` ya hecho)
- Un valor random fuerte para `JWT_SECRET` (ej. `openssl rand -hex 32`, o pídemelo y te ayudo a generarlo)

---

## Parte A — Base de datos en Neon

1. En Neon: **New Project** (nombre sugerido: `logify`, región cercana a `oregon` — la misma región que usarás en Render, para menor latencia).
2. Neon te da un connection string por defecto a la base `neondb`. Anótalo — de ahí vas a sacar host/usuario/password para las 4 bases reales.
3. Conéctate con el SQL Editor de Neon (o `psql` con el connection string) y corre en orden:
   - `Backend/init-db.sql` (crea `orders_db`, `inventory_db`, `shipping_db`, `notification_db`)
   - `Backend/stored-procedures.sql`
   - `Backend/seed.sql` (opcional, solo si quieres datos de prueba)
4. Arma el `DB_URL` de cada servicio reemplazando **solo el nombre de la base** al final del connection string que te dio Neon, por ejemplo:
   ```
   postgresql://<usuario>:<password>@<tu-endpoint>.neon.tech/orders_db?sslmode=require
   ```
   (el `?sslmode=require` es obligatorio, Neon no acepta conexiones sin SSL).

> **Nota de plan:** Neon free = 0.5 GB de almacenamiento y 100 CU-hora/mes por proyecto, con auto-suspensión del cómputo tras 5 min sin uso (se reactiva solo en la siguiente query, toma menos de un segundo — mucho más rápido que el "despertar" de Render).

---

## Parte B — Backend en Render

### B.1 — Primer deploy (con placeholders)

1. En Render: **New → Blueprint** → conecta y selecciona el repo `jhonabruzzi278/logify`, branch `main`. Render detecta [render.yaml](render.yaml) automáticamente y te muestra los 5 servicios.
2. Al confirmar, Render te va a pedir los valores de las variables con `sync: false` (no están en el repo por seguridad):
   - `DB_URL` de cada uno de los 4 microservicios (usa los connection strings que armaste en la Parte A)
   - `JWT_SECRET` — el mismo valor random fuerte en los 4 servicios
   - `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — déjalos vacíos por ahora si no vas a mandar correos reales todavía (el código cae a modo demo/consola)
   - `VAPID_PRIVATE_KEY` — vacío por ahora si no usarás Web Push aún
3. Aplica el blueprint. Los 5 servicios van a hacer su primer build — puede tardar varios minutos.

### B.2 — Enlazar las URLs reales entre servicios (segunda pasada)

`render.yaml` trae placeholders tipo `https://REEMPLAZAR-orders-service.onrender.com` en las variables que apuntan de un servicio a otro, porque la URL real solo existe después de crear el servicio.

1. Entra a cada uno de los 5 servicios en el dashboard de Render y copia su URL real (aparece arriba del todo, algo como `https://orders-service-a1b2.onrender.com`).
2. Ve a **Settings → Environment** de cada servicio que referencia a otros, y reemplaza el placeholder por la URL real copiada:
   - `orders-service`: `INVENTORY_SERVICE_URL`, `SHIPPING_SERVICE_URL`
   - `shipping-service`: `NOTIFICATION_SERVICE_URL`
   - `api-gateway`: `ORDERS_SERVICE_URL`, `INVENTORY_SERVICE_URL`, `SHIPPING_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`
3. Guardar cada variable dispara un redeploy automático de ese servicio.

### Verificación

```bash
# La URL real de api-gateway (Render dashboard)
curl https://api-gateway-xxxx.onrender.com/healthz
# Respuesta: {"status":"UP","service":"logify-api-gateway"}

curl https://api-gateway-xxxx.onrender.com/api/orders
# Debe responder 401/403 sin token, no 502/504 — confirma que nginx alcanza orders-service
```

> **Nota de plan:** en el free de Render, un servicio sin tráfico por 15 min se "duerme" y tarda ~30-60s en despertar en la siguiente request. Como el gateway llama en cadena a los otros 4, la **primera** request tras un rato de inactividad puede tardar varios minutos o dar timeout mientras todos despiertan en cascada — probá de nuevo si la primera falla. Además, Render da 750 horas gratis de instancia **compartidas entre todos tus servicios del workspace** por mes; con 5 servicios que se duermen solos cuando no hay tráfico, alcanza sin problema para validar la idea, pero no lo uses así para tráfico real constante.

---

## Parte C — Frontend (React/Vite) en Vercel

1. En Vercel: **Add New → Project → Import Git Repository** → selecciona el repo de Logify.
2. **Root Directory:** `Frontend`. Vercel detecta Vite automáticamente
   (build command `vite build`, output `dist`) — no hace falta tocar nada ahí.
3. **Environment Variables**, agrega:
   - `VITE_API_BASE_URL` = la URL real del api-gateway en Render (Parte B), ej.
     `https://api-gateway-xxxx.onrender.com`. La cambiarás a
     `https://api.logify.cl` en la Parte E.
4. **Deploy**. Te da una URL `https://<algo>.vercel.app` — pruébala: login con
   un usuario demo (`admin` / `Admin123!`) debe funcionar (dale un par de
   intentos si justo los servicios de Render estaban dormidos).

## Parte D — Landing (Next.js) en Vercel

1. En Vercel: **Add New → Project → Import Git Repository** → mismo repo,
   proyecto **separado** del Frontend.
2. **Root Directory:** `Landing`. Vercel detecta Next.js automáticamente.
3. Si la Landing consume la API en algún punto (formulario de contacto,
   futuro signup de tenants), agrega la variable de entorno equivalente
   (`NEXT_PUBLIC_API_URL` o como se llame en tu código) apuntando al mismo
   api-gateway de Render.
4. **Deploy**. Verifica la URL `https://<algo>.vercel.app`.

---

## Parte E — Conectar logify.cl

### E.1 — Landing: `logify.cl` + `www.logify.cl`

1. En el proyecto **Landing** de Vercel → **Settings → Domains** → agrega `logify.cl`.
2. Vercel te va a pedir dos registros (los nombres exactos los muestra su
   panel, pero típicamente son):
   - Para el dominio raíz (`logify.cl`, sin subdominio): registro **A** →
     `76.76.21.21`
   - Para `www.logify.cl`: registro **CNAME** → `cname.vercel-dns.com`
3. Agrega también `www.logify.cl` como dominio en el mismo proyecto Vercel.
4. En DonDominio → panel DNS de `logify.cl` → crea esos dos registros con
   los valores exactos que te mostró Vercel.

### E.2 — Frontend: `*.logify.cl` (wildcard, un subdominio por empresa)

1. En el proyecto **Frontend** de Vercel → **Settings → Domains** → agrega `*.logify.cl`.
2. Vercel te da un registro **CNAME**: `*` → `cname.vercel-dns.com`.
3. En DonDominio, crea ese registro CNAME con host `*` apuntando a ese valor.

> **Nota de plan:** los dominios wildcard en Vercel pueden requerir plan Pro
> para el certificado SSL automático. Mientras validas la idea sin gastar,
> puedes arrancar con subdominios concretos uno por uno (`acme.logify.cl`)
> en el plan gratuito.

### E.3 — API: `api.logify.cl`

1. En Render, en el servicio **api-gateway** → **Settings → Custom Domains** → agrega `api.logify.cl`.
2. Render te da un registro **CNAME** específico.
3. En DonDominio, crea ese CNAME con host `api` apuntando a ese valor.

> El certificado SSL de un custom domain en Render (plan free) también es
> gratis vía Let's Encrypt, se emite automático al verificar el DNS.

### E.4 — Esperar propagación

```bash
curl -I https://api.logify.cl/healthz
curl -I https://logify.cl
```

Ambos deben responder `200` con certificado válido.

---

## Parte F — Actualizar variables con el dominio real

Una vez que `api.logify.cl` responde:

**En Render, en los 4 microservicios** (Settings → Environment):
```
ALLOWED_ORIGINS=https://logify.cl,https://www.logify.cl,https://*.logify.cl
APP_URL=https://logify.cl
```
> Si tu middleware de CORS no soporta wildcard en `ALLOWED_ORIGINS`, dímelo y
> ajustamos `Backend/shared/security.js` para matchear `*.logify.cl` por regex
> en vez de por lista exacta.

**En Vercel, proyecto Frontend:**
```
VITE_API_BASE_URL=https://api.logify.cl
```

**En Vercel, proyecto Landing (si aplica):**
```
NEXT_PUBLIC_API_URL=https://api.logify.cl
```

Redeploy los 3 proyectos de Vercel y los servicios de Render que tocaste.

---

## Parte G — CI/CD

Tanto Render como Vercel quedan conectados directo al repo de GitHub (cada
servicio de `render.yaml` tiene autodeploy activado por defecto): cada push a
`main` dispara redeploy automático en los 5 servicios de Render y en los 2
proyectos de Vercel. No necesitas GitHub Actions para esto.

---

## Checklist antes de considerarlo "producción" (o al menos "demo estable")

- [ ] `JWT_SECRET` es un valor random fuerte (no el default del repo), igual en los 4 servicios
- [ ] `ALLOWED_ORIGINS` con dominios reales de `logify.cl`, no `*`
- [ ] Healthcheck OK en los 4 servicios + gateway, con el dominio final
- [ ] Las URLs entre servicios (Parte B.2) apuntan a las URLs reales, no a los placeholders `REEMPLAZAR-...`
- [ ] `https://logify.cl`, `https://www.logify.cl`, `https://api.logify.cl` responden con certificado válido
- [ ] SMTP configurado si vas a enviar correos reales (si no, queda en modo demo/consola)
- [ ] VAPID keys generadas (`npx web-push generate-vapid-keys`) si usarás Web Push
- [ ] Variables `.env` reales del repo local NO están commiteadas (verificar `.gitignore`)
- [ ] Probado un login real desde `https://logify.cl` de punta a punta, incluyendo el caso de servicios "dormidos" (primera request lenta pero exitosa)

## Costos: US$0/mes — con estas limitaciones

- **Render (free):** 750 horas de instancia compartidas entre todos tus
  servicios del workspace por mes; servicios sin tráfico 15 min se duermen y
  tardan ~30-60s en despertar; 100 GB/mes de banda ancha total.
- **Neon (free):** 0.5 GB de almacenamiento y 100 CU-hora/mes por proyecto;
  el cómputo se autosuspende tras 5 min sin uso (reactivación rápida, <1s).
- **Vercel (Hobby, free):** alcanza para Landing + Frontend sin wildcard; el
  wildcard `*.logify.cl` puede pedir plan Pro (~US$20/mes).
- **DonDominio:** el dominio `.cl` ya está pagado (renovación anual aparte).

Cuando el proyecto tenga tráfico real y valga la pena invertir, el camino de
upgrade más directo es mover los 4 microservicios de "web" a "private
service" en Render (plan Starter, ~US$7/mes c/u) para tener red privada real,
o migrar a una plataforma paga con red privada incluida (DigitalOcean App
Platform, Railway) — avísame cuando llegues a ese punto y armamos esa guía.
