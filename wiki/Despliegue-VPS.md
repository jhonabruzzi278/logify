# Despliegue del backend en un VPS

Esta guía cubre mover **solo el backend** (4 microservicios + Postgres +
API gateway) a un VPS propio, detrás de HTTPS real. **Frontend y Landing
se quedan en Vercel** tal como están hoy — solo van a apuntar a la nueva
URL del backend.

Si más adelante quieres mover también el frontend al mismo VPS, el
`Frontend/Dockerfile` ya está listo (fue el único hallazgo roto de la
auditoría, y ya se corrigió); avísame y agrego esa pieza.

---

## 1. Elegir el VPS

### Specs mínimas recomendadas

| Recurso | Mínimo | Recomendado |
|---|---|---|
| RAM | 2 GB | **4 GB** |
| CPU | 1 vCPU | 2 vCPU |
| Disco | 25 GB SSD | 40 GB SSD |
| SO | Ubuntu 22.04/24.04 LTS | Ubuntu 24.04 LTS |

Con 4GB de RAM hay margen cómodo: Postgres + 4 servicios Node + nginx +
Caddy consumen en conjunto ~1.5-2GB bajo carga normal (ver límites en
`docker-compose.prod.yml`), dejando el resto para el sistema operativo y
picos de tráfico.

### Proveedores razonables (sin afiliación, solo referencia)

- **Hetzner Cloud** — mejor relación precio/recursos, datacenters en Europa/EEUU.
- **DigitalOcean** — muy documentado, buena UI, droplets simples.
- **Vultz / Linode (Akamai)** — alternativas equivalentes a DigitalOcean.

Cualquiera con Ubuntu 24.04 LTS sirve igual; esta guía no depende del proveedor.

---

## 2. Preparar el servidor

Conectate por SSH como root la primera vez y corré el script de setup
(`Backend/scripts/00-vps-server-setup.sh`) — automatiza usuario `deploy`,
firewall, Docker y rotación de logs en un solo paso idempotente:

```bash
# Opción A: si ya tenés el repo en tu maquina, lo subís y lo corrés
scp Backend/scripts/00-vps-server-setup.sh root@IP_DEL_VPS:/root/
ssh root@IP_DEL_VPS "bash /root/00-vps-server-setup.sh"

# Opción B: pegás el contenido del script directo en la sesión SSH
ssh root@IP_DEL_VPS
# (pegar y correr el contenido de Backend/scripts/00-vps-server-setup.sh)
```

El script hace:
1. Actualiza paquetes del sistema
2. Crea el usuario `deploy` no-root con sudo (nunca operes como root del día a día)
3. Firewall (ufw): solo SSH, 80 y 443 — todo lo demás (5432, 8081-8085) queda cerrado
4. Instala Docker
5. Configura rotación de logs de Docker (`/etc/docker/daemon.json`, evita llenar el disco con el tiempo)

Al terminar, copiá tu clave SSH al nuevo usuario y conectate siempre como
`deploy`, no como `root`:

```bash
ssh-copy-id deploy@IP_DEL_VPS
```

> Esto es exactamente lo que resuelve el punto crítico de la auditoría: en
> `docker-compose.prod.yml` ningún servicio interno (Postgres, los 4
> microservicios) publica puertos al host — solo Caddy expone 80/443. El
> firewall es una segunda capa de defensa por si algo se mal-configura.

---

## 3. DNS

En el panel de tu dominio, agregá dos registros **A** apuntando a la IP
del VPS: uno para la API y otro para la página pública de status
(Uptime Kuma, ver [Monitoreo.md](Monitoreo.md)):

```
Tipo   Nombre   Valor
A      api      <IP_DEL_VPS>
A      status   <IP_DEL_VPS>
```

Esto deja `api.tu-dominio.cl` y `status.tu-dominio.cl` resueltos al VPS.
Esperá unos minutos a que propague (`dig api.tu-dominio.cl` y
`dig status.tu-dominio.cl` para confirmar).

---

## 4. Clonar y configurar

```bash
git clone <tu-repo> logify
cd logify

cp .env.example .env
nano .env
```

Completá en `.env` (todo esto es **obligatorio**, `docker-compose.prod.yml`
falla explícitamente si falta alguno):

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=')   # generalo y pegalo
JWT_SECRET=$(openssl rand -base64 48)                         # generalo y pegalo, distinto al de local
ALLOWED_ORIGINS=https://tu-dominio.cl,https://www.tu-dominio.cl,https://tu-proyecto.vercel.app
API_DOMAIN=api.tu-dominio.cl
STATUS_DOMAIN=status.tu-dominio.cl
ACME_EMAIL=tu-correo@tu-dominio.cl
```

`API_DOMAIN`, `STATUS_DOMAIN` y `ACME_EMAIL` los usa Caddy para pedir los
certificados TLS automáticamente contra Let's Encrypt — no hace falta
tocar certbot ni nada manual. **Los tres son obligatorios**:
`docker-compose.prod.yml` falla explícitamente al levantar Caddy si falta
alguno (incluido `STATUS_DOMAIN`, aunque no uses la página de status
todavía — podés apuntarlo igual y simplemente no anunciarla).

`ALLOWED_ORIGINS` debe listar los dominios **reales** desde donde el
frontend en Vercel va a llamar a la API (CORS los rechaza si no están acá).

Para Web Push también se requieren `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y
`VAPID_SUBJECT`. En producción se almacenan como GitHub Secrets; no deben
copiarse al repositorio ni imprimirse en logs.

---

## 5. Levantar el stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Verificar que todo esté sano:

```bash
curl https://api.tu-dominio.cl/healthz
curl -X POST https://api.tu-dominio.cl/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'
```

Si el certificado TLS tarda en aparecer la primera vez, revisá logs de Caddy:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

---

## 6. Configurar Uptime Kuma (status.tu-dominio.cl)

Entrá a `https://status.tu-dominio.cl` — la primera vez pide crear el
usuario admin. Después, seguí [Monitoreo.md](Monitoreo.md) para agregar
los monitores recomendados (los 4 microservicios, el gateway, frontend y
landing) y las notificaciones.

---

## 7. Apuntar el frontend (Vercel) a la nueva API

En el proyecto de Vercel (Frontend), agregar/actualizar la variable de entorno:

```
VITE_API_BASE_URL=https://api.tu-dominio.cl
```

y redeployar. El resto de la configuración de Vercel no cambia.

---

## 8. Backups de Postgres

Corré el script de post-clone, que activa el backup automático:

```bash
bash Backend/scripts/01-vps-post-clone-setup.sh
```

Hace: da permisos de ejecución a `backup.sh` y agrega el cron diario a
las 3 AM (retiene 14 días por defecto) si todavía no existe. Es
idempotente, se puede correr de nuevo sin duplicar el cron.

Los `.sql.gz` quedan en `Backend/postgres/backups/` (fuera del repo,
`.gitignore` ya los excluye). **Recomendado**: copiar periódicamente esa
carpeta a un storage externo (S3, Backblaze B2, o simplemente `scp` a tu
máquina) — un backup que vive solo en el mismo disco que puede fallar no
es un backup real.

Restaurar un backup puntual:

```bash
gunzip -c Backend/postgres/backups/orders_db_2026-08-05.sql.gz | \
  docker exec -i logify-db psql -U postgres -d orders_db
```

---

## 9. Logs

La rotación de logs de Docker ya quedó configurada por el script del
paso 2 (`00-vps-server-setup.sh`) — sin eso, Docker no rota logs y con
el tiempo pueden llenar el disco.

Ver logs de un servicio puntual:

```bash
docker compose -f docker-compose.prod.yml logs -f orders-service
```

---

## 10. Actualizar (redeploy) — automático

**Desde el 2026-08-07 el redeploy ya no es manual.** Cada push a `main`
con el CI en verde dispara `.github/workflows/deploy.yml`, que se
conecta por SSH al VPS y corre `Backend/scripts/02-vps-deploy.sh`. Ese
script:

1. Sincroniza SMTP opcional, soporte y VAPID desde GitHub Secrets al `.env`
   del VPS sin exponer sus valores.
2. Hace `git reset --hard origin/main` — **no** `git pull` con merge.
   El VPS deja de tener working tree propio: es un espejo exacto de
   `main`. Cualquier edición manual hecha directo por SSH se pierde en
   el próximo deploy, a propósito — el incidente del 2026-08-06 (ver
   `aidlc-docs/operations/POST_MORTEMS/2026-08-06-signup-404-produccion.md`)
   pasó justamente porque el VPS y `main` habían divergido.
3. Reconstruye y levanta los contenedores esperando a que los
   healthchecks pasen (`docker compose up -d --build --wait`).
4. Reinicia `api-gateway` siempre — `nginx.conf` es un bind mount,
   `--build` no lo recarga solo.
5. Prueba `https://api.logify.cl/healthz` de verdad (con reintentos).
   Si falla, **revierte solo** al commit anterior y el job de GitHub
   Actions queda en rojo — nunca deja el VPS a medio desplegar sin que
   quede visible.

**Ya no hagas `git pull` ni edites archivos a mano por SSH en este
directorio** — se va a pisar en el próximo deploy. Si necesitás
desplegar sin un commit nuevo (ej. para reintentar tras arreglar algo
externo al repo), disparalo a mano desde GitHub: pestaña **Actions →
Deploy VPS → Run workflow**.

Credenciales: el pipeline usa una llave SSH dedicada (`VPS_SSH_KEY` en
GitHub Secrets, distinta de cualquier llave personal), autorizada en
`~/.ssh/authorized_keys` del usuario `deploy` en el VPS.

Para debug manual, el script también se puede correr a mano:

```bash
cd ~/logify
bash Backend/scripts/02-vps-deploy.sh
```

---

## 11. Pendientes recomendados (no bloqueantes, pero valen la pena)

- ~~**CI/CD**~~ ✅ Hecho — `.github/workflows/ci.yml` corre tests en los
  4 microservicios, Frontend (typecheck + vitest + build) y Landing
  (build) en cada PR y push a `main`, con branch protection obligatoria
  en `main` (ver [Flujo-Git.md](Flujo-Git.md)).
- ~~**Redeploy automático**~~ ✅ Hecho — ver paso 10 de arriba
  (`.github/workflows/deploy.yml` + `Backend/scripts/02-vps-deploy.sh`),
  con rollback automático si el health check post-deploy falla.
- ~~**Monitoreo básico**~~ ✅ Hecho — Uptime Kuma self-hosted en
  `status.tu-dominio.cl` (paso 6 de esta guía), ver
  [Monitoreo.md](Monitoreo.md) para configurar los monitores y
  notificaciones. Ya no hace falta una cuenta externa (UptimeRobot,
  Better Uptime, etc.) como se sugería acá antes.
- **Alertas de disco**: en un VPS chico, un log o backup que crece sin
  límite puede llenar el disco silenciosamente. Un check de cron simple
  (`df -h` + email si pasa 80%) es suficiente para este tamaño de proyecto.
- **Restringir la llave SSH de deploy con forced-command**: hoy
  `VPS_SSH_KEY` puede abrir una sesión normal como `deploy`. Se puede
  endurecer agregando `command="cd ~/logify && bash Backend/scripts/02-vps-deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`
  antes de la clave pública en `authorized_keys`, para que esa llave
  específica *solo* pueda correr el script de deploy aunque se filtre.
  No aplicado todavía por el riesgo de dejar el pipeline sin poder
  desplegar si algo queda mal configurado — hacerlo con cuidado y
  probando el path de deploy inmediatamente después.
