// Adjunta a cada request autenticado una conexion dedicada del pool de
// runtime (rol Postgres restringido, sin BYPASSRLS) con el tenant seteado
// via set_config, para que las politicas RLS filtren los datos incluso si
// algun query llegara a olvidar el WHERE tenant_id=... Requiere que
// requireTenant ya haya corrido antes (necesita req.tenantId).
//
// set_config(..., true) es la forma parametrizable de SET LOCAL: el ultimo
// argumento "true" lo hace transaction-scoped, por lo que hace falta un
// BEGIN explicito (sin transaccion, "local" no tendria efecto y quedaria
// seteado para toda la conexion, que aca es por-request de todos modos, pero
// mejor no depender de eso).
function attachTenantDb(runtimePool) {
  return async function (req, res, next) {
    if (!runtimePool) {
      return next(new Error('runtimePool no esta configurado (falta DB_RUNTIME_URL)'));
    }
    const tenantId = Number(req.tenantId);
    if (!Number.isInteger(tenantId)) {
      return res.status(401).json({ error: 'Sesion invalida, inicia sesion de nuevo' });
    }

    let client;
    try {
      client = await runtimePool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    } catch (err) {
      if (client) client.release();
      return next(err);
    }

    req.db = client;
    let finished = false;

    async function finalize(commit) {
      if (finished) return;
      finished = true;
      try {
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      } catch {
        // la conexion ya puede estar rota; se libera igual mas abajo
      } finally {
        client.release();
      }
    }

    res.on('finish', () => finalize(res.statusCode < 500));
    res.on('close', () => finalize(false));
    next();
  };
}

module.exports = { attachTenantDb };
