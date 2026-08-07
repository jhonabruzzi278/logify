const { Pool } = require('pg');

function createPool(dbName, connectionString) {
  const url = connectionString || process.env.DB_URL;
  if (!url) {
    throw new Error(`DB_URL no está definida (requerida para conectar a ${dbName})`);
  }
  const pool = new Pool({ connectionString: url, max: 3 });
  pool.on('error', (err) => console.error('DB pool error:', err.message));
  return pool;
}

module.exports = { createPool };
