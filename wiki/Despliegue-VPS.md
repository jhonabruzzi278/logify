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

Conectate por SSH como root la primera vez, y hacé lo básico de hardening:

```bash
# Actualizar paquetes
apt update && apt upgrade -y

# Crear un usuario no-root con sudo (nunca operes como root del día a día)
adduser deploy
usermod -aG sudo deploy

# Copiar tu clave SSH al nuevo usuario (desde tu maquina local)
# ssh-copy-id deploy@IP_DEL_VPS

# Firewall: solo SSH, HTTP y HTTPS. Todo lo demás (5432, 8081-8085) queda cerrado.
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

A partir de acá, conectate siempre como `deploy`, no como `root`.

> Esto es exactamente lo que resuelve el punto crítico de la auditoría: en
> `docker-compose.prod.yml` ningún servicio interno (Postgres, los 4
> microservicios) publica puertos al host — solo Caddy expone 80/443. El
> firewall es una segunda capa de defensa por si algo se mal-configura.

### Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
# cerrar sesion y volver a entrar para que el grupo tome efecto
docker --version
docker compose version
```

---

## 3. DNS

En el panel de tu dominio, agregá un registro **A** apuntando el
subdominio de la API a la IP del VPS:

```
Tipo   Nombre   Valor
A      api      <IP_DEL_VPS>
```

Esto deja `api.tu-dominio.cl` resuelto al VPS. Esperá unos minutos a que
propague (`dig api.tu-dominio.cl` para confirmar).

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
ACME_EMAIL=tu-correo@tu-dominio.cl
```

`API_DOMAIN` y `ACME_EMAIL` los usa Caddy para pedir el certificado TLS
automáticamente contra Let's Encrypt — no hace falta tocar certbot ni nada
manual.

`ALLOWED_ORIGINS` debe listar los dominios **reales** desde donde el
frontend en Vercel va a llamar a la API (CORS los rechaza si no están acá).

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

## 6. Apuntar el frontend (Vercel) a la nueva API

En el proyecto de Vercel (Frontend), agregar/actualizar la variable de entorno:

```
VITE_API_BASE_URL=https://api.tu-dominio.cl
```

y redeployar. El resto de la configuración de Vercel no cambia.

---

## 7. Backups de Postgres

```bash
chmod +x Backend/postgres/backup.sh
crontab -e
```

Agregar (backup diario a las 3 AM, retiene 14 días por defecto):

```
0 3 * * * /home/deploy/logify/Backend/postgres/backup.sh >> /var/log/logify-backup.log 2>&1
```

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

## 8. Logs

Por defecto Docker no rota logs, y con el tiempo pueden llenar el disco.
Configurar rotación a nivel de daemon (una sola vez, afecta a todos los
contenedores):

```bash
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
```

Ver logs de un servicio puntual:

```bash
docker compose -f docker-compose.prod.yml logs -f orders-service
```

---

## 9. Actualizar (redeploy)

```bash
cd logify
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Esto reconstruye solo las imágenes cuyo código cambió y recrea esos
contenedores; Postgres no se toca (mismo volumen).

> **Antes de mergear a la rama que despliega**: corré `npm test` en los 4
> servicios de `Backend/` (o mejor, automatizalo — ver "Pendientes" abajo)
> para no desplegar una regresión.

---

## 10. Pendientes recomendados (no bloqueantes, pero valen la pena)

- **CI/CD**: hoy el despliegue es manual (`git pull` + rebuild). Un GitHub
  Actions simple que corra `npm test` en los 4 servicios en cada PR evita
  desplegar con tests rotos. Si querés, lo armo en otra sesión.
- **Monitoreo básico**: un uptime checker externo gratuito (UptimeRobot,
  Better Uptime) pegándole a `/healthz` cada 5 min, con alerta a tu correo.
- **Alertas de disco**: en un VPS chico, un log o backup que crece sin
  límite puede llenar el disco silenciosamente. Un check de cron simple
  (`df -h` + email si pasa 80%) es suficiente para este tamaño de proyecto.
