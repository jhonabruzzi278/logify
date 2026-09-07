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
#
# Sincronizacion de credenciales (SYNC_ENV_FROM_CI=1): cuando el workflow
# "Deploy VPS" invoca este script via SSH, exporta esa variable junto con
# SMTP_HOST/PORT/USER/PASS/FROM/REPLY_TO, SUPPORT_WHATSAPP_URL, VAPID y
# CLERK_SECRET_KEY/CLERK_WEBHOOK_SIGNING_SECRET (leidas de GitHub Secrets) y
# SIGNUP_ENABLED (configuracion versionada del workflow) --
# este script las escribe en el .env local del VPS antes de levantar los
# contenedores, para que el .env del VPS nunca quede desincronizado de lo
# configurado en GitHub. Si se corre a mano por SSH sin esa variable, no
# toca el .env (deja lo que ya haya).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

HEALTH_URL="https://api.logify.cl/healthz"
COMPOSE="docker compose -f docker-compose.prod.yml"

sync_env_var() {
  local key="$1" value="$2"
  [ -z "$value" ] && return 0
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

sync_env_from_ci() {
  [ "${SYNC_ENV_FROM_CI:-}" = "1" ] || return 0
  local before
  before="$(sha256sum .env 2>/dev/null || true)"
  echo "==> Sincronizando credenciales desde GitHub Actions al .env del VPS..."
  sync_env_var SMTP_HOST "${SMTP_HOST:-}"
  sync_env_var SMTP_PORT "${SMTP_PORT:-}"
  sync_env_var SMTP_USER "${SMTP_USER:-}"
  sync_env_var SMTP_PASS "${SMTP_PASS:-}"
  sync_env_var SMTP_FROM "${SMTP_FROM:-}"
  sync_env_var SMTP_REPLY_TO "${SMTP_REPLY_TO:-}"
  sync_env_var SUPPORT_WHATSAPP_URL "${SUPPORT_WHATSAPP_URL:-}"
  sync_env_var VAPID_PUBLIC_KEY "${VAPID_PUBLIC_KEY:-}"
  sync_env_var VAPID_PRIVATE_KEY "${VAPID_PRIVATE_KEY:-}"
  sync_env_var VAPID_SUBJECT "${VAPID_SUBJECT:-}"
  sync_env_var CLERK_SECRET_KEY "${CLERK_SECRET_KEY:-}"
  sync_env_var CLERK_WEBHOOK_SIGNING_SECRET "${CLERK_WEBHOOK_SIGNING_SECRET:-}"
  sync_env_var PLATFORM_ADMIN_CLERK_USER_IDS "${PLATFORM_ADMIN_CLERK_USER_IDS:-}"
  sync_env_var BILLING_DEFAULT_PROVIDER "${BILLING_DEFAULT_PROVIDER:-}"
  sync_env_var FLOW_API_KEY "${FLOW_API_KEY:-}"
  sync_env_var FLOW_SECRET_KEY "${FLOW_SECRET_KEY:-}"
  sync_env_var MERCADOPAGO_ACCESS_TOKEN "${MERCADOPAGO_ACCESS_TOKEN:-}"
  sync_env_var SIGNUP_ENABLED "${SIGNUP_ENABLED:-}"
  if [ "$before" != "$(sha256sum .env 2>/dev/null || true)" ]; then
    echo "==> .env cambio -- se forzara redeploy aunque el commit no haya cambiado."
    ENV_CHANGED=1
  fi
}

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

ENV_CHANGED=0
sync_env_from_ci

if [ "$PREVIOUS_SHA" = "$NEW_SHA" ] && [ "$ENV_CHANGED" != "1" ]; then
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
