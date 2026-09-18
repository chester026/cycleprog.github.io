const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('auth', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    // /api/register sends a verification email via Brevo (brevo-config.js).
    // BREVO_API_KEY is a dummy value (see setup.js) so that code path
    // doesn't short-circuit before trying to send — this monkey-patches the
    // shared axios instance it posts through (lib/http.js's externalHttp)
    // so the call resolves locally instead of ever reaching the real
    // network, matching this suite's "no outbound network" requirement.
    const httpLib = require('../../lib/http');
    httpLib.externalHttp.post = async () => ({ data: { messageId: 'test-message-id' } });
  }, 30000);

  it('registers then logs in for a token', async () => {
    const email = `register-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post('/api/register')
      .send({ email, password: 'Sup3rSecret!', name: 'Reg User' });
    expect(registerRes.status).toBe(200);
    expect(registerRes.body.success).toBe(true);

    // Registration leaves email_verified = false and /api/login requires
    // it (server.js ~2664) — flip it directly, same as a clicked
    // verification link would.
    await pool.query('UPDATE users SET email_verified = true WHERE email = $1', [email]);

    const loginRes = await request(app).post('/api/login').send({ email, password: 'Sup3rSecret!' });
    expect(loginRes.status).toBe(200);
    expect(typeof loginRes.body.token).toBe('string');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app).post('/api/login').send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for a user with NULL password_hash with 401, not 500', async () => {
    const email = `strava-only-${Date.now()}@example.com`;
    await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified, created_at)
       VALUES ($1, NULL, 'Strava Only', true, NOW())`,
      [email]
    );
    const res = await request(app).post('/api/login').send({ email, password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects GET /api/goals without a token with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed JSON bodies with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('rejects registering an email that already exists with 400 EMAIL_ALREADY_EXISTS', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/register')
      .send({ email: user.email, password: 'Sup3rSecret!', name: 'Someone Else' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('GET /api/verify-email without a token returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/verify-email with an unknown token returns 400 INVALID_TOKEN', async () => {
    const res = await request(app).get('/api/verify-email').query({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('GET /api/verify-email with an expired token returns 400 TOKEN_EXPIRED', async () => {
    const email = `expired-verify-${Date.now()}@example.com`;
    await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified, verification_token, verification_token_expires, created_at)
       VALUES ($1, 'x', 'Expired Token User', false, 'expired-token-123', NOW() - INTERVAL '1 hour', NOW())`,
      [email]
    );
    const res = await request(app).get('/api/verify-email').query({ token: 'expired-token-123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('POST /api/unlink_strava without a token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).post('/api/unlink_strava');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
