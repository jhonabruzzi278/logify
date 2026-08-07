'use strict';

// Prueba el modulo real de shared/security (CORS + helmet + rate limit).
// Cubre el bug corregido: ALLOWED_ORIGINS=* dejaba pasar cualquier origen
// pese a que el comentario del propio archivo decia que no soportaba wildcard.

const express = require('express');
const request = require('supertest');
const { applySecurity } = require('../shared/security');

function buildApp() {
  const app = express();
  applySecurity(app);
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

describe('shared/security - CORS', () => {
  const ORIGINAL_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (ORIGINAL_ALLOWED_ORIGINS === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED_ORIGINS;
    }
  });

  it('rechaza el arranque si ALLOWED_ORIGINS contiene el wildcard "*"', () => {
    process.env.ALLOWED_ORIGINS = '*';
    expect(() => buildApp()).toThrow(/ALLOWED_ORIGINS/);
  });

  it('rechaza el arranque si "*" viene mezclado con otros origenes', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl,*';
    expect(() => buildApp()).toThrow(/ALLOWED_ORIGINS/);
  });

  it('permite un origen que esta en la lista explicita', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl';
    const app = buildApp();
    const res = await request(app).get('/ping').set('Origin', 'https://app.logify.cl');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.logify.cl');
  });

  it('rechaza un origen que no esta en la lista ni matchea los patrones', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl';
    const app = buildApp();
    const res = await request(app).get('/ping').set('Origin', 'https://evil-site.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permite subdominios de logify.cl aunque no esten listados explicitamente', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl';
    const app = buildApp();
    const res = await request(app).get('/ping').set('Origin', 'https://acme.logify.cl');
    expect(res.headers['access-control-allow-origin']).toBe('https://acme.logify.cl');
  });

  it('permite un tunel de ngrok temporal', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl';
    const app = buildApp();
    const res = await request(app).get('/ping').set('Origin', 'https://abc123.ngrok-free.app');
    expect(res.headers['access-control-allow-origin']).toBe('https://abc123.ngrok-free.app');
  });

  it('permite requests sin header Origin (llamadas server-to-server)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.logify.cl';
    const app = buildApp();
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});
