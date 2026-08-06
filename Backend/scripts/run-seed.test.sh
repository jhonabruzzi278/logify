#!/usr/bin/env bash
# Test de los guardas de seguridad de run-seed.sh. No toca ninguna base de
# datos real: en todos los casos que prueba, el script debe bloquear ANTES
# de llegar al "docker exec". Correr con: bash Backend/scripts/run-seed.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SEED="$SCRIPT_DIR/run-seed.sh"
FAILURES=0

assert_blocked() {
  local desc="$1"; shift
  if "$@" >/tmp/run-seed-test-out 2>&1; then
    echo "FALLO: $desc -- se esperaba que bloqueara pero salio con codigo 0"
    FAILURES=$((FAILURES + 1))
  else
    echo "OK: $desc"
  fi
}

# 1. NODE_ENV=production debe bloquear sin pedir confirmacion ni tocar docker
assert_blocked "bloquea cuando NODE_ENV=production" env NODE_ENV=production bash "$RUN_SEED"

# 2. APP_ENV=production debe bloquear tambien
assert_blocked "bloquea cuando APP_ENV=production" env APP_ENV=production bash "$RUN_SEED"

# 3. Sin CONFIRM_SEED y sin confirmar interactivamente, debe cancelar (no ejecutar docker)
assert_blocked "cancela si la respuesta interactiva no es 'si'" bash -c "echo 'no' | bash '$RUN_SEED'"
assert_blocked "cancela si no hay respuesta (stdin vacio)" bash -c "echo '' | bash '$RUN_SEED'"

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "Todos los guardas de seed.sql funcionan correctamente."
  exit 0
else
  echo "$FAILURES prueba(s) fallaron."
  exit 1
fi
