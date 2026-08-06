import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke test: 1 usuario, unas pocas iteraciones. Corre esto primero,
 * siempre, antes del test de carga real — si esto falla, el problema es
 * de configuracion/entorno, no de rendimiento.
 *
 *   k6 run Backend/load-tests/smoke.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: 'admin', password: 'Admin123!' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(loginRes, { 'login ok': (r) => r.status === 200 && !!r.json('token') });
  return { token: loginRes.json('token') };
}

export default function (data) {
  const authHeaders = { headers: { Authorization: `Bearer ${data.token}` } };

  check(http.get(`${BASE_URL}/api/orders/test`), {
    'orders health: 200': (r) => r.status === 200,
  });

  check(http.get(`${BASE_URL}/api/orders`, authHeaders), {
    'GET /api/orders: 200': (r) => r.status === 200,
  });

  check(http.get(`${BASE_URL}/api/inventory`, authHeaders), {
    'GET /api/inventory: 200': (r) => r.status === 200,
  });

  check(http.get(`${BASE_URL}/api/shipments`, authHeaders), {
    'GET /api/shipments: 200': (r) => r.status === 200,
  });

  sleep(1);
}
