#!/usr/bin/env bash
# Setup post-clone: activa el backup automatico de Postgres.
# Correr como usuario "deploy", DESPUES de:
#   1. git clone <tu-repo> logify && cd logify
#   2. cp .env.example .env && nano .env   (completar POSTGRES_PASSWORD, JWT_SECRET, etc.)
#   3. docker compose -f docker-compose.prod.yml up -d --build
#
# Uso:
#   cd ~/logify
#   bash Backend/scripts/01-vps-post-clone-setup.sh
#
# Que hace (ver wiki/Despliegue-VPS.md paso 7):
#   1. Da permisos de ejecucion a backup.sh
#   2. Agrega el cron diario de backup (3 AM, retiene 14 dias) si no existe ya
#
# Es idempotente: se puede correr mas de una vez sin duplicar el cron.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_SCRIPT="$REPO_DIR/Backend/postgres/backup.sh"
CRON_LINE="0 3 * * * $BACKUP_SCRIPT >> /var/log/logify-backup.log 2>&1"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "No se encontro $BACKUP_SCRIPT. Corre este script desde la raiz del repo clonado." >&2
  exit 1
fi

echo "==> Dando permisos de ejecucion a backup.sh..."
chmod +x "$BACKUP_SCRIPT"

echo "==> Configurando cron de backup diario..."
if crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
  echo "El cron de backup ya esta configurado, se omite."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Cron agregado: $CRON_LINE"
fi

echo ""
echo "Recordatorio importante: los backups quedan en Backend/postgres/backups/,"
echo "en el mismo disco que el resto del servidor. Copialos periodicamente a un"
echo "storage externo (S3, Backblaze B2, o scp a tu maquina) -- un backup que vive"
echo "solo ahi no es un backup real si el disco falla."
echo ""
echo "Proximo paso recomendado: configurar un uptime checker externo (UptimeRobot"
echo "o Better Uptime, gratis) apuntando a https://tu-dominio-api/healthz cada 5 min."
