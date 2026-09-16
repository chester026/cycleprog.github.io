process.env.JWT_SECRET = 'test';
// Required before ../db creates a real Pool. Any Postgres env vars are fine —
// no connection is ever actually made, since pool.query is stubbed below
// before middleware/auth.js (which requires the same cached ../db module)
// ever calls it.
process.env.PGHOST = process.env.PGHOST || 'localhost';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// middleware/auth.js and this test both require('../db') — Node's require
// cache means they share the exact same `pool` object, so stubbing its
// .query here (before requiring middleware/auth) is enough to keep this
// test off a real database, without needing vi.mock's ESM-only interception.
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const { authMiddleware, requireAdmin } = require('../middleware/auth');

function buildApp(...middlewares) {
  const app = express();
  app.get('/protected', ...middlewares, (req, res) => {
    res.json({ ok: true, userId: req.userId });
  });
  return app;
}

describe('authMiddleware', () => {
  it('rejects with 401 "No token" when Authorization header is missing', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'No token' });
  });

  it('rejects with 401 "Invalid token" for a bad token', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  it('sets req.user and req.userId and calls next() for a valid token', async () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(42);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns 403 when the user is not an admin', async () => {
    queryMock.mockResolvedValue({ rows: [{ is_admin: false }] });
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware, requireAdmin);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('calls next() when the user is an admin', async () => {
    queryMock.mockResolvedValue({ rows: [{ is_admin: true }] });
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware, requireAdmin);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
