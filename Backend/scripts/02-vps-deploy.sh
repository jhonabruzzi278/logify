#!/usr/bin/env bash
# Deploy automatizado del backend al VPS. Corre EN el VPS, invocado por
# SSH desde el job "deploy" de .github/workflows/ci.yml en cada push a
# main (tambien se puede correr a mano si hace falta un redeploy sin
# commit nuevo).
#
# Uso:
#   cd ~/logify && bash Backend/scripts/02-vps-deploy.sh
#
# Que hace (ver wiki/Despliegue-VPS.md):
#   1. git reset --hard origin/main -- el repo es la unica fuente de
#      verdad, cualquier cambio hecho a mano en el VPS se pierde en el
#      proximo deploy (intencional: ver el incidente del 2026-08-06 en
#      aidlc-docs/operations/POST_MORTEMS/).
#   2. Reconstruye y levanta los contenedores, esperando a que los
#      healthchecks de Docker pasen (--wait).
#   3. Reinicia el gateway nginx siempre -- nginx.conf es un bind mount,
#      "--build" no lo recarga solo.
#   4. Health check real contra el dominio publico (Caddy -> nginx ->
#      orders-service), con reintentos.
#   5. Si el health check final falla, revierte solo al commit anterior
#      y termina con exit 1 -- nunca deja el VPS a medio desplegar sin
#      que quede visible en GitHub Actions.
#
# Es idempotente: si ya estaba al dia con origin/main, no hace nada.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

HEALTH_URL="https://api.logify.cl/healthz"
COMPOSE="docker compose -f docker-compose.prod.yml"

deploy_current_commit() {
  echo "==> Reconstruyendo y levantando contenedores..."
  $COMPOSE up -d --build --wait --wait-timeout 120

  echo "==> Reiniciando api-gateway (nginx.conf es un bind mount, --build no lo recarga solo)..."
  $COMPOSE restart api-gateway
}

health_check() {
  local intentos=5
  local i
  for i in $(seq 1 "$intentos"); do
    if curl -fsS "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
    echo "   intento $i/$intentos fallo, reintentando en 5s..."
    sleep 5
  done
  return 1
}

PREVIOUS_SHA="$(git rev-parse HEAD)"
echo "==> Commit actual (guardado para rollback si algo falla): $PREVIOUS_SHA"

echo "==> Trayendo origin/main..."
git fetch origin main
git reset --hard origin/main
NEW_SHA="$(git rev-parse HEAD)"
echo "==> Nuevo commit: $NEW_SHA"

if [ "$PREVIOUS_SHA" = "$NEW_SHA" ]; then
  echo "==> Ya estaba al dia con main, nada que desplegar."
  exit 0
fi

deploy_current_commit

echo "==> Esperando que el sistema estabilice antes del health check..."
sleep 15

echo "==> Health check contra $HEALTH_URL..."
if health_check; then
  echo "==> Deploy exitoso: $NEW_SHA esta en produccion."
  exit 0
fi

echo "==> HEALTH CHECK FALLO tras el deploy de $NEW_SHA. Revirtiendo a $PREVIOUS_SHA..."
git reset --hard "$PREVIOUS_SHA"
deploy_current_commit

if health_check; then
  echo "==> Rollback completo: $PREVIOUS_SHA esta sano en produccion. El deploy de $NEW_SHA fallo y fue revertido."
else
  echo "==> ALERTA: el rollback a $PREVIOUS_SHA tampoco pasa el health check. Requiere intervencion manual inmediata."
fi

exit 1
