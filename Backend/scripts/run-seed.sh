#!/usr/bin/env bash
# Wrapper de seguridad para seed.sql: ver Backend/seed.sql para el detalle de
# lo que hace (TRUNCA tablas operacionales y las repuebla con datos de demo).
# Exige confirmacion explicita y bloquea si detecta que el entorno es
# produccion, para evitar que una ejecucion accidental borre datos reales.
#
# Uso:
#   bash Backend/scripts/run-seed.sh                  # entorno dev/demo (pide confirmacion)
#   CONFIRM_SEED=si bash Backend/scripts/run-seed.sh   # no interactivo (CI/demo)
#
# Variables de entorno:
#   DB_CONTAINER  nombre del contenedor de postgres (default: logify-db)
#   CONFIRM_SEED  si vale "si", omite el prompt interactivo
#   NODE_ENV / APP_ENV  si valen "production", el script se niega a correr

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="$SCRIPT_DIR/../seed.sql"
DB_CONTAINER="${DB_CONTAINER:-logify-db}"

if [ "${NODE_ENV:-}" = "production" ] || [ "${APP_ENV:-}" = "production" ]; then
  echo "BLOQUEADO: NODE_ENV/APP_ENV=production. Este script vacia tablas operacionales" >&2
  echo "y no debe correr contra produccion. Si de verdad necesitas resembrar datos de" >&2
  echo "demo en produccion, respalda primero con Backend/postgres/backup.sh y corre" >&2
  echo "el psql manualmente, fuera de este wrapper." >&2
  exit 1
fi

if [ ! -f "$SEED_FILE" ]; then
  echo "No se encontro $SEED_FILE." >&2
  exit 1
fi

if [ "${CONFIRM_SEED:-}" != "si" ]; then
  echo "Este script VACIARA pedidos, clientes, inventario, ventas, envios y"
  echo "notificaciones del contenedor '$DB_CONTAINER' y los reemplazara con datos de demo."
  read -r -p "Escribe 'si' para continuar: " answer
  if [ "$answer" != "si" ]; then
    echo "Cancelado." >&2
    exit 1
  fi
fi

echo "==> Ejecutando seed.sql contra el contenedor $DB_CONTAINER..."
docker exec -i "$DB_CONTAINER" psql -U postgres < "$SEED_FILE"
echo "==> Seed aplicado."
