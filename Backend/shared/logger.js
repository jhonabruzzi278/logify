const { AsyncLocalStorage } = require('async_hooks');

// Correlacion de requests entre los 4 microservicios: el request-id se genera
// (o se hereda de x-request-id) en el middleware de shared/app.js, viaja en
// AsyncLocalStorage durante todo el ciclo de vida del request (sin pasar el
// valor a mano por cada funcion), y se reenvia a las llamadas inter-servicio
// via forwardedFetch para poder seguir un mismo request a traves de logs de
// distintos servicios (ver wiki/Monitoreo.md).
const requestContext = new AsyncLocalStorage();

function runWithRequestId(requestId, fn) {
  return requestContext.run({ requestId }, fn);
}

function currentRequestId() {
  return requestContext.getStore()?.requestId;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function emit(level, message, meta) {
  if (LEVELS[level] < configuredLevel) return;

  const requestId = currentRequestId();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...(meta === undefined ? {} : meta !== null && typeof meta === 'object' ? meta : { detail: meta }),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
  runWithRequestId,
  currentRequestId,
};
