// Parseo de CSV de importación de productos.
// Movido tal cual desde src/index.js (refactor P0.1 — sin cambios de lógica).

const CSV_TEMPLATE_HEADERS = ['sku', 'nombre', 'categoria', 'stock', 'precio', 'costo', 'unidad', 'iva', 'activo'];
const CSV_REQUIRED_HEADERS = ['sku', 'nombre'];
const MAX_IMPORT_ROWS = 2000;

// Parser simple: no soporta comas dentro de campos entre comillas (el
// template no las necesita: sku/nombre/categoria/etc. son valores simples).
function parseInventoryCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [], errors: ['El CSV está vacío'] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const missing = CSV_REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) return { headers, rows: [], errors: [`Faltan columnas requeridas: ${missing.join(', ')}`] };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const raw = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? '']));
    if (!raw.sku || !raw.nombre) {
      errors.push(`Fila ${i + 1}: sku y nombre son obligatorios`);
      continue;
    }
    rows.push({
      sku: raw.sku,
      name: raw.nombre,
      category: raw.categoria || 'otros',
      stock: raw.stock ? parseInt(raw.stock, 10) || 0 : 0,
      price: raw.precio ? parseInt(raw.precio, 10) || 0 : 0,
      cost: raw.costo ? parseInt(raw.costo, 10) || 0 : 0,
      unitOfMeasure: raw.unidad || 'unidad',
      taxRate: raw.iva ? parseFloat(raw.iva) || 0 : 0,
      active: raw.activo ? /^(si|sí|true|1)$/i.test(raw.activo) : true,
    });
  }
  return { headers, rows, errors };
}

module.exports = { CSV_TEMPLATE_HEADERS, CSV_REQUIRED_HEADERS, MAX_IMPORT_ROWS, parseInventoryCsv };
