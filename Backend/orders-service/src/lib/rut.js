// Validación de RUT chileno (módulo 11).
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).
function validateRutChileno(rut) {
  const clean = String(rut).replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return { valid: false, error: 'Formato inválido. Ejemplo: 12345678-9' };
  const digits = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + expectedDv;
  return { valid: dv === expectedDv, formatted, digitoVerificador: expectedDv };
}

module.exports = { validateRutChileno };
