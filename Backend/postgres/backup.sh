#!/usr/bin/env bash
# Backup diario de las 4 bases de Logify. Pensado para correr por cron en el
# VPS (fuera de Docker), contra el contenedor logify-db.
#
# Instalar (ejecutar una vez en el VPS):
#   chmod +x Backend/postgres/backup.sh
#   crontab -e
#   # agregar la linea (backup diario a las 3:00 AM):
#   0 3 * * * cd /ruta/absoluta/a/Logify && Backend/postgres/backup.sh >> Backend/postgres/backups/backup.log 2>&1
#
# Restaurar un backup:
#   gunzip -c backups/orders_db_2026-08-05.sql.gz | docker exec -i logify-db psql -U postgres -d orders_db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER="${POSTGRES_CONTAINER:-logify-db}"
DATE=$(date +%Y-%m-%d)

mkdir -p "$BACKUP_DIR"

for db in orders_db inventory_db shipping_db notification_db; do
  echo "[$(date -Iseconds)] Backing up $db..."
  target="$BACKUP_DIR/${db}_${DATE}.sql.gz"
  temporary="$BACKUP_DIR/.${db}_${DATE}.sql.gz.tmp"
  rm -f "$temporary"
  if ! docker exec "$CONTAINER" pg_dump -U postgres "$db" | gzip > "$temporary"; then
    rm -f "$temporary"
    echo "[$(date -Iseconds)] ERROR: fallo el backup de $db" >&2
    exit 1
  fi
  if ! gzip -t "$temporary"; then
    rm -f "$temporary"
    echo "[$(date -Iseconds)] ERROR: el backup de $db no es un gzip valido" >&2
    exit 1
  fi
  mv "$temporary" "$target"
done

echo "[$(date -Iseconds)] Borrando backups con mas de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date -Iseconds)] Backup completo. Archivos en $BACKUP_DIR:"
ls -lh "$BACKUP_DIR" | grep "$DATE"
