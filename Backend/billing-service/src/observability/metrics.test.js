'use strict';

const { MetricsRegistry } = require('./metrics');
const { safeEqual, requireMetricsToken } = require('../security/metrics-auth');

describe('metrics', () => {
  test('solo conserva etiquetas de baja cardinalidad permitidas', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('billing_operations_total', {
      provider: 'fake', operation: 'create', status: 'success', environment: 'sandbox',
      tenant_id: 'sensitive', email: 'buyer@example.cl',
    });
    metrics.increment('billing_operations_total', {
      provider: 'fake', operation: 'create', status: 'success', environment: 'sandbox',
    });
    const output = metrics.render();
    expect(output).toContain('billing_operations_total');
    expect(output).toContain(' 2');
    expect(output).not.toContain('tenant');
    expect(output).not.toContain('buyer');
    metrics.increment('escaped_total', { provider: 'a"b\\c\n' });
    expect(metrics.render()).toContain('a\\"b\\\\c\\n');
    expect(new MetricsRegistry().render()).toBe('');
    const defaults = new MetricsRegistry();
    defaults.increment('default_total');
    expect(defaults.render()).toBe('default_total 1\n');
  });

  test('comparacion constante y middleware fail-closed', () => {
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'wrong')).toBe(false);
    const next = jest.fn();
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    requireMetricsToken('secret')({ headers: { authorization: 'Bearer secret' } }, { status, json }, next);
    expect(next).toHaveBeenCalled();
    requireMetricsToken('secret')({ headers: {} }, { status, json }, next);
    expect(status).toHaveBeenCalledWith(401);
    requireMetricsToken('')({ headers: {} }, { status, json }, next);
    expect(status).toHaveBeenCalledWith(503);
  });
});
