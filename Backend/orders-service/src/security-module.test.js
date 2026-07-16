'use strict';

jest.mock('../shared/db', () => ({ createPool: jest.fn() }));
jest.mock('../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../shared/security', () => ({ applySecurity: jest.fn() }));
jest.mock('../shared/shutdown', () => ({ gracefulShutdown: jest.fn() }));
jest.mock('../shared/auth', () => ({
  signToken: jest.fn().mockReturnValue('test-jwt-token'),
  verifyToken: jest.fn().mockReturnValue({ sub: 'admin', name: 'Admin', role: 'owner', 'cognito:groups': ['owner'] }),
  authMiddleware: (req, _res, next) => { req.user = { sub: 'admin', name: 'Admin', role: 'owner', 'cognito:groups': ['owner'] }; next(); },
  requireRole: () => (req, _res, next) => next(),
  extractRoleFromRequest: (req) => (req.user && req.user.role) ? req.user.role.toLowerCase() : null,
  JWT_SECRET: 'test-secret',
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createPool } = require('../shared/db');

const mockQuery = jest.fn();
createPool.mockReturnValue({ query: mockQuery, on: jest.fn(), end: jest.fn() });

const { app } = require('./index');

const JWT_SECRET = 'test-secret';
const STRONG_PASSWORD = 'NuevaClave#2026';

describe('security-module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // ─── GET /api/security/forgot-password/question ───────────────────────────

  describe('GET /api/security/forgot-password/question', () => {
    it('retorna la pregunta secreta del usuario', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ secret_question: '¿Cuál es el nombre de tu primera mascota?' }] });
      const res = await request(app).get('/api/security/forgot-password/question?username=bodega');
      expect(res.status).toBe(200);
      expect(res.body.question).toBe('¿Cuál es el nombre de tu primera mascota?');
    });

    it('retorna una pregunta genérica si el usuario no existe (no revela existencia)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/security/forgot-password/question?username=noexiste');
      expect(res.status).toBe(200);
      expect(typeof res.body.question).toBe('string');
      expect(res.body.question.length).toBeGreaterThan(0);
    });

    it('retorna 400 si falta username', async () => {
      const res = await request(app).get('/api/security/forgot-password/question');
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/security/forgot-password/verify ─────────────────────────────

  describe('POST /api/security/forgot-password/verify', () => {
    it('entrega un resetToken cuando la respuesta secreta es correcta', async () => {
      const answerHash = await bcrypt.hash('firulais', 10);
      mockQuery.mockResolvedValueOnce({ rows: [{ username: 'bodega', secret_answer_hash: answerHash }] });
      const res = await request(app)
        .post('/api/security/forgot-password/verify')
        .send({ username: 'bodega', secretAnswer: 'Firulais' }); // mayúscula/minúscula no debe importar
      expect(res.status).toBe(200);
      expect(typeof res.body.resetToken).toBe('string');

      const payload = jwt.verify(res.body.resetToken, JWT_SECRET);
      expect(payload.sub).toBe('bodega');
      expect(payload.purpose).toBe('password-reset');
    });

    it('retorna 400 si la respuesta secreta es incorrecta', async () => {
      const answerHash = await bcrypt.hash('firulais', 10);
      mockQuery.mockResolvedValueOnce({ rows: [{ username: 'bodega', secret_answer_hash: answerHash }] });
      const res = await request(app)
        .post('/api/security/forgot-password/verify')
        .send({ username: 'bodega', secretAnswer: 'incorrecta' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si el usuario no existe (mismo mensaje que respuesta incorrecta)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app)
        .post('/api/security/forgot-password/verify')
        .send({ username: 'noexiste', secretAnswer: 'firulais' });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si falta username o secretAnswer', async () => {
      const res = await request(app).post('/api/security/forgot-password/verify').send({ username: 'bodega' });
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/security/forgot-password/reset ──────────────────────────────

  describe('POST /api/security/forgot-password/reset', () => {
    function validResetToken(sub = 'bodega') {
      return jwt.sign({ sub, purpose: 'password-reset' }, JWT_SECRET, { expiresIn: '10m' });
    }

    it('actualiza la contraseña con un resetToken válido y contraseñas coincidentes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ username: 'bodega' }] });
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        resetToken: validResetToken(),
        newPassword: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('retorna 400 si la confirmación no coincide', async () => {
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        resetToken: validResetToken(),
        newPassword: STRONG_PASSWORD,
        confirmPassword: 'OtraClave#2026',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no coincide/i);
    });

    it('retorna 400 si la contraseña nueva es débil', async () => {
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        resetToken: validResetToken(),
        newPassword: 'debil',
        confirmPassword: 'debil',
      });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si el resetToken expiró o es inválido', async () => {
      const expiredToken = jwt.sign({ sub: 'bodega', purpose: 'password-reset' }, JWT_SECRET, { expiresIn: -1 });
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        resetToken: expiredToken,
        newPassword: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si el token no tiene purpose password-reset (ej. un JWT de sesión normal)', async () => {
      const sessionToken = jwt.sign({ sub: 'bodega', role: 'warehouse' }, JWT_SECRET, { expiresIn: '8h' });
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        resetToken: sessionToken,
        newPassword: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      expect(res.status).toBe(400);
    });

    it('retorna 400 si falta resetToken', async () => {
      const res = await request(app).post('/api/security/forgot-password/reset').send({
        newPassword: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
      });
      expect(res.status).toBe(400);
    });
  });
});
