import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

/**
 * Prueba de carga sostenida contra el API gateway (nginx en :8080).
 *
 * IMPORTANTE: corre esto contra el docker-compose local o un ambiente de
 * staging desechable, NUNCA contra produccion — el escenario "flujo
 * completo" crea pedidos reales en la base de datos.
 *
 *   k6 run Backend/load-tests/load.js
 *   k6 run --env BASE_URL=http://localhost:8080 --env VUS_MAX=100 Backend/load-tests/load.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS_MAX = parseInt(__ENV.VUS_MAX || '30', 10);

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(VUS_MAX * 0.3) }, // calentamiento
        { duration: '1m', target: VUS_MAX }, // carga objetivo
        { duration: '1m', target: VUS_MAX }, // sostenida
        { duration: '30s', target: 0 }, // enfriamiento
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: 'admin', password: 'Admin123!' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (loginRes.status !== 200) {
    throw new Error(`Setup: login fallo con status ${loginRes.status}. ¿Esta el stack corriendo (docker compose up)?`);
  }
  const token = loginRes.json('token');
  const authHeaders = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  const customersRes = http.get(`${BASE_URL}/api/customers`, authHeaders);
  const customers = customersRes.status === 200 ? customersRes.json() : [];
  const customerId = customers.length > 0 ? customers[0].id : 1;

  return { token, customerId };
}

export default function (data) {
  const authHeaders = { headers: { Authorization: `Bearer ${data.token}` } };
  const jsonHeaders = { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } };

  // 80% trafico de solo lectura (lo mas representativo de uso real del dashboard)
  group('lecturas', () => {
    const responses = [
      http.get(`${BASE_URL}/api/orders`, authHeaders),
      http.get(`${BASE_URL}/api/inventory`, authHeaders),
      http.get(`${BASE_URL}/api/shipments`, authHeaders),
      http.get(`${BASE_URL}/api/customers`, authHeaders),
    ];
    for (const r of responses) {
      const ok = check(r, { 'lectura: 200': (res) => res.status === 200 });
      errorRate.add(!ok);
    }
  });

  sleep(1);

  // 20% flujo de escritura completo: crear pedido (deja datos de prueba)
  if (Math.random() < 0.2) {
    group('flujo_completo_pedido', () => {
      const createRes = http.post(
        `${BASE_URL}/api/orders`,
        JSON.stringify({ customerId: data.customerId, sku: 'COCA-2L', quantity: 1 }),
        jsonHeaders
      );
      const created = check(createRes, { 'crear pedido: 201': (r) => r.status === 201 });
      errorRate.add(!created);

      if (created) {
        const orderId = createRes.json('orderId');
        const confirmRes = http.put(`${BASE_URL}/api/orders/${orderId}/confirm`, null, authHeaders);
        errorRate.add(!check(confirmRes, { 'confirmar pedido: 200': (r) => r.status === 200 }));
      }
    });
  }

  sleep(1);
}
