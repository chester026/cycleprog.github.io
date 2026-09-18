process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
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
  beforeEach(() => {
    queryMock.mockReset();
    // Default: a user row with token_version 0, matching a token with no
    // `tv` claim (or `tv: 0`) — the common case for these tests unless a
    // test overrides it below.
    queryMock.mockResolvedValue({ rows: [{ token_version: 0, is_admin: false }] });
  });

  it('rejects with 401 "No token" when Authorization header is missing', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'No token', code: 'UNAUTHORIZED' });
  });

  it('rejects with 401 "Invalid token" for a bad token', async () => {
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  });

  it('sets req.user and req.userId and calls next() for a valid token', async () => {
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(42);
  });

  it('rejects with 401 when the token_version claim no longer matches the DB (T-4.5, revoked)', async () => {
    // Token was issued when token_version was 1; the DB has since moved on
    // to 2 (e.g. a password reset or logout-all happened) — same 401 body
    // as any other invalid token, so this doesn't reveal why it failed.
    queryMock.mockResolvedValueOnce({ rows: [{ token_version: 2, is_admin: false }] });
    const token = jwt.sign({ userId: 7, tv: 1 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  });

  it('rejects with 401 when the user row no longer exists (T-4.5, deleted account)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const token = jwt.sign({ userId: 999 }, process.env.JWT_SECRET);
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  });

  it('accepts a token with no `tv` claim as token_version 0 (pre-T-4.5 tokens keep working)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ token_version: 0, is_admin: false }] });
    const token = jwt.sign({ userId: 5 }, process.env.JWT_SECRET); // no `tv` claim at all
    const app = buildApp(authMiddleware);
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
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
    expect(res.body).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
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
