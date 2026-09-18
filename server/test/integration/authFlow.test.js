const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Split out of auth.test.js (T-4.1): the register/verify/login/resend/
// unlink round-trip tests that each spend one or more hits against
// authLimiter (max 10 per 15 min, per lib/middleware/rateLimits.js) — this
// file gets its own worker/app instance (vitest `isolate: true`) and so its
// own limiter counters, keeping auth.test.js's own budget free.
describe('auth — full register/verify/login/resend/unlink flows', () => {
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

  it('registers, verifies via the real token, then logs in (full happy path)', async () => {
    const email = `full-flow-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post('/api/register')
      .send({ email, password: 'Sup3rSecret!', name: 'Flow User' });
    expect(registerRes.status).toBe(200);

    const row = await pool.query('SELECT verification_token FROM users WHERE email = $1', [email]);
    const token = row.rows[0].verification_token;
    expect(typeof token).toBe('string');

    const verifyRes = await request(app).get('/api/verify-email').query({ token });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toBe('Email verified successfully');

    const loginRes = await request(app).post('/api/login').send({ email, password: 'Sup3rSecret!' });
    expect(loginRes.status).toBe(200);
    expect(typeof loginRes.body.token).toBe('string');
  });

  it('POST /api/resend-verification without an email returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/resend-verification').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/resend-verification for an unknown email returns 404 USER_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/resend-verification')
      .send({ email: `no-such-user-${Date.now()}@example.com` });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('POST /api/resend-verification for an already-verified email returns 400 ALREADY_VERIFIED', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app).post('/api/resend-verification').send({ email: user.email });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_VERIFIED');
  });

  it('POST /api/resend-verification for an unverified email sends a new token', async () => {
    const email = `resend-${Date.now()}@example.com`;
    await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified, created_at)
       VALUES ($1, 'x', 'Unverified User', false, NOW())`,
      [email]
    );
    const res = await request(app).post('/api/resend-verification').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Verification email sent successfully');

    const row = await pool.query('SELECT verification_token FROM users WHERE email = $1', [email]);
    expect(typeof row.rows[0].verification_token).toBe('string');
  });

  it('rejects login for a not-yet-verified user with 403 needsVerification', async () => {
    const email = `unverified-login-${Date.now()}@example.com`;
    const user = await createUser(pool, app, request, { email, emailVerified: false });
    const res = await request(app).post('/api/login').send({ email: user.email, password: user.password });
    expect(res.status).toBe(403);
    expect(res.body.needsVerification).toBe(true);
  });

  it('unlinks Strava and returns a fresh token', async () => {
    // Mocks the outbound Strava deauthorize call (never hit the real
    // network) rather than skip it — exercises the same code path a
    // strava-linked user takes, unlike admin.test.js's no-op case.
    const stravaOAuth = require('../../services/strava/oauth');
    const deauthSpy = vi.spyOn(stravaOAuth, 'deauthorize').mockResolvedValue(true);

    const user = await createUser(pool, app, request);
    // A fresh numeric id per run — see oauth.test.js's insertUser comment:
    // this suite's users table is a real, persistent database, so a
    // hardcoded strava_id would collide with a leftover row from an
    // earlier run.
    const stravaId = String(Date.now() * 10 + 9);
    await pool.query(
      'UPDATE users SET strava_id = $1, strava_athlete_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = 9999999999 WHERE id = $4',
      [stravaId, 'tok', 'reftok', user.id]
    );

    const res = await request(app)
      .post('/api/unlink_strava')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(deauthSpy).toHaveBeenCalledWith('tok');

    const row = await pool.query('SELECT strava_id FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].strava_id).toBeNull();

    deauthSpy.mockRestore();
  });
});
