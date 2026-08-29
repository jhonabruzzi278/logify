#!/usr/bin/env bash
# Despliega exclusivamente billing-service en un proyecto Docker aislado.
# El workflow prepara un checkout separado en ~/logify-billing-sandbox/source.
set -euo pipefail

COMPOSE_PROJECT_NAME="logify-billing-sandbox"
COMPOSE_FILE="docker-compose.billing-sandbox.yml"
ENV_FILE="${SANDBOX_ENV_FILE:-$HOME/logify-billing-sandbox/shared/billing.env}"
HEALTH_URL="http://127.0.0.1:8087/healthz"

required=(POSTGRES_PASSWORD DB_RUNTIME_PASSWORD JWT_SECRET BILLING_METRICS_TOKEN)
for variable_name in "${required[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Falta la variable obligatoria $variable_name" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$ENV_FILE")"
umask 077
{
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'DB_RUNTIME_PASSWORD=%s\n' "$DB_RUNTIME_PASSWORD"
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
  printf 'JWT_SECRET_PREVIOUS=%s\n' "${JWT_SECRET_PREVIOUS:-}"
  printf 'CLERK_SECRET_KEY=%s\n' "${CLERK_SECRET_KEY:-}"
  printf 'PLATFORM_ADMIN_CLERK_USER_IDS=%s\n' "${PLATFORM_ADMIN_CLERK_USER_IDS:-}"
  printf 'ALLOWED_ORIGINS=%s\n' "${ALLOWED_ORIGINS:-https://gestion.logify.cl}"
  printf 'BILLING_METRICS_TOKEN=%s\n' "$BILLING_METRICS_TOKEN"
  printf 'BILLING_FAKE_CHECKOUT_URL=%s\n' "${BILLING_FAKE_CHECKOUT_URL:-https://gestion-sandbox.logify.cl/billing/fake}"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

compose=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
response_file=""
headers_file=""

on_exit() {
  exit_code=$?
  [[ -z "$response_file" ]] || rm -f "$response_file"
  [[ -z "$headers_file" ]] || rm -f "$headers_file"
  if [[ $exit_code -ne 0 ]]; then
    echo "==> Diagnostico del stack tras el fallo..." >&2
    "${compose[@]}" ps >&2 || true
    "${compose[@]}" logs --tail=100 billing-service billing-api-gateway >&2 || true
  fi
  exit "$exit_code"
}
trap on_exit EXIT

echo "==> Construyendo y levantando billing sandbox..."
"${compose[@]}" up -d --build --remove-orphans

echo "==> Esperando health check con base de datos..."
healthy=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  "${compose[@]}" ps
  "${compose[@]}" logs --tail=100 billing-service billing-api-gateway
  exit 1
fi

echo "==> Ejecutando smoke tests autenticados e idempotentes..."
tenant_token=$("${compose[@]}" exec -T billing-service node -e \
  "process.stdout.write(require('jsonwebtoken').sign({sub:'sandbox-deploy',name:'Sandbox Deploy',role:'admin',tenant_id:7,tenant_slug:'sandbox'},process.env.JWT_SECRET,{expiresIn:'5m'}))")
other_tenant_token=$("${compose[@]}" exec -T billing-service node -e \
  "process.stdout.write(require('jsonwebtoken').sign({sub:'sandbox-isolation',name:'Sandbox Isolation',role:'admin',tenant_id:8,tenant_slug:'other'},process.env.JWT_SECRET,{expiresIn:'5m'}))")
idempotency_key="deploy-${SANDBOX_DEPLOY_SHA:-manual}"
response_file=$(mktemp)
headers_file=$(mktemp)

create_status=$(curl --silent --show-error --output "$response_file" --dump-header "$headers_file" --write-out '%{http_code}' \
  --request POST http://127.0.0.1:8087/api/billing/v1/subscriptions \
  --header "Authorization: Bearer $tenant_token" \
  --header 'X-Tenant-Slug: sandbox' \
  --header "Idempotency-Key: $idempotency_key" \
  --header 'Content-Type: application/json' \
  --data '{"planId":"plan_sandbox_monthly","customer":{"email":"sandbox-deploy@logify.invalid","name":"Sandbox Deploy"}}')
[[ "$create_status" == "201" ]] || { echo "Creacion sandbox fallo con HTTP $create_status" >&2; exit 1; }

subscription_id=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$response_file" | head -n 1)
[[ -n "$subscription_id" ]] || { echo "La respuesta no contiene subscription id" >&2; exit 1; }

replay_status=$(curl --silent --show-error --output /dev/null --dump-header "$headers_file" --write-out '%{http_code}' \
  --request POST http://127.0.0.1:8087/api/billing/v1/subscriptions \
  --header "Authorization: Bearer $tenant_token" \
  --header 'X-Tenant-Slug: sandbox' \
  --header "Idempotency-Key: $idempotency_key" \
  --header 'Content-Type: application/json' \
  --data '{"planId":"plan_sandbox_monthly","customer":{"email":"sandbox-deploy@logify.invalid","name":"Sandbox Deploy"}}')
[[ "$replay_status" == "201" ]] || { echo "Replay idempotente fallo con HTTP $replay_status" >&2; exit 1; }
grep -qi '^Idempotency-Replayed: true' "$headers_file" || { echo "Falta confirmacion de replay idempotente" >&2; exit 1; }

isolation_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "http://127.0.0.1:8087/api/billing/v1/subscriptions/$subscription_id" \
  --header "Authorization: Bearer $other_tenant_token" \
  --header 'X-Tenant-Slug: other')
[[ "$isolation_status" == "404" ]] || { echo "RLS no aislo el tenant; HTTP $isolation_status" >&2; exit 1; }

metrics_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:8087/metrics --header "Authorization: Bearer $BILLING_METRICS_TOKEN")
[[ "$metrics_status" == "404" ]] || { echo "Metrics no debe publicarse por el gateway sandbox" >&2; exit 1; }

"${compose[@]}" ps
echo "==> Billing sandbox sano; API aun accesible solo desde localhost:8087."
