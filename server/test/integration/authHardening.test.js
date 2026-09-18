const request = require('supertest');
const bcrypt = require('bcrypt');
const { bootstrap } = require('./setup');

// T-4.5 auth hardening (S-13 token revocation, S-14 refresh tokens, S-27
// email-change re-verification, A-05 password reset without user
// enumeration). Own file/worker (vitest `isolate: true`, see authFlow.test.js's
// header) so its authLimiter budget (max 10/15min — only /login,
// /forgot-password, /reset-password below spend it) never competes with
// auth.test.js/authFlow.test.js's own.
//
// Everything here is required lazily, after bootstrap() — see oauth.test.js's
// header for why: anything under server/ pulls in ../config, which must only
// be evaluated once setup.js has pointed the env at the scratch database.
let issueSessionToken, authService, brevoConfig;

async function insertUser(pool, { email, password = 'Sup3rSecret!' } = {}) {
  const finalEmail = email || `hardening-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, created_at)
     VALUES ($1, $2, 'Hardening Test User', true, NOW())
     RETURNING id, email, token_version`,
    [finalEmail, passwordHash]
  );
  const user = result.rows[0];
  return { id: user.id, email: user.email, password };
}

describe('auth hardening (T-4.5)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ issueSessionToken } = require('../../lib/jwt'));
    authService = require('../../services/auth');
    brevoConfig = require('../../brevo-config');
  }, 30000);

  // --- token_version / logout-all (S-13) -----------------------------------

  describe('token revocation', () => {
    it('POST /api/auth/logout-all bumps token_version and invalidates the JWT that called it', async () => {
      const user = await insertUser(pool);
      const token = issueSessionToken({ id: user.id, email: user.email, token_version: 0 });

      const logoutRes = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({ success: true });

      const row = await pool.query('SELECT token_version FROM users WHERE id = $1', [user.id]);
      expect(row.rows[0].token_version).toBe(1);

      // Same (now stale) token, same endpoint — must 401, not succeed again.
      const secondRes = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);
      expect(secondRes.status).toBe(401);
      expect(secondRes.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects a request with 401 UNAUTHORIZED without a token', async () => {
      const res = await request(app).post('/api/auth/logout-all');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  // --- refresh tokens (S-14) ------------------------------------------------

  describe('refresh token rotation', () => {
    it('rotates a valid refresh token into a fresh (token, refreshToken) pair', async () => {
      const user = await insertUser(pool);
      const refreshToken = await authService.issueRefreshToken(user.id, { userAgent: 'vitest' });

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.refreshToken).not.toBe(refreshToken);

      const oldHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
      const oldRow = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [oldHash]);
      expect(oldRow.rows[0].revoked_at).not.toBeNull();

      const newHash = require('crypto').createHash('sha256').update(res.body.refreshToken).digest('hex');
      const newRow = await pool.query('SELECT revoked_at, user_id FROM refresh_tokens WHERE token_hash = $1', [newHash]);
      expect(newRow.rows[0].revoked_at).toBeNull();
      expect(newRow.rows[0].user_id).toBe(user.id);
    });

    it('rejects an unknown refresh token with 401', async () => {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-refresh-token' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('reusing an already-rotated refresh token 401s and revokes the whole family', async () => {
      const user = await insertUser(pool);
      const firstToken = await authService.issueRefreshToken(user.id, { userAgent: 'vitest' });

      const firstRotate = await request(app).post('/api/auth/refresh').send({ refreshToken: firstToken });
      expect(firstRotate.status).toBe(200);
      const secondToken = firstRotate.body.refreshToken;

      // Reuse the ORIGINAL (already-revoked) token — this must look like
      // theft: 401, and the whole family (including the still-fresh
      // secondToken nobody has used yet) gets revoked with it.
      const reuseRes = await request(app).post('/api/auth/refresh').send({ refreshToken: firstToken });
      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.code).toBe('UNAUTHORIZED');

      // secondToken was never itself reused, but its family was torn down —
      // it must no longer work either.
      const secondRotate = await request(app).post('/api/auth/refresh').send({ refreshToken: secondToken });
      expect(secondRotate.status).toBe(401);

      const crypto = require('crypto');
      const secondHash = crypto.createHash('sha256').update(secondToken).digest('hex');
      const row = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [secondHash]);
      expect(row.rows[0].revoked_at).not.toBeNull();
    });
  });

  describe('logout', () => {
    it('POST /api/auth/logout revokes the given refresh token', async () => {
      const user = await insertUser(pool);
      const refreshToken = await authService.issueRefreshToken(user.id, { userAgent: 'vitest' });

      const res = await request(app).post('/api/auth/logout').send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const row = await pool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [hash]);
      expect(row.rows[0].revoked_at).not.toBeNull();

      // Trying to refresh with it afterwards is indistinguishable from any
      // other already-rotated/revoked token — 401.
      const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });

    it('is a no-op (200) for an unknown refresh token — logout never reveals validity', async () => {
      const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'never-issued' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });

  // --- forgot/reset password (A-05, S-13) -----------------------------------

  describe('forgot-password / reset-password', () => {
    it('always returns 200 for an unknown email (no user enumeration)', async () => {
      const res = await request(app)
        .post('/api/forgot-password')
        .send({ email: `no-such-user-${Date.now()}@example.com` });
      expect(res.status).toBe(200);
    });

    it('end-to-end: request reset, consume token, log in with the new password, old JWT rejected', async () => {
      const user = await insertUser(pool, { password: 'OldPassw0rd!' });
      const oldToken = issueSessionToken({ id: user.id, email: user.email, token_version: 0 });

      const sendSpy = vi.spyOn(brevoConfig, 'sendPasswordResetEmail').mockResolvedValue(true);

      const forgotRes = await request(app).post('/api/forgot-password').send({ email: user.email });
      expect(forgotRes.status).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [sentToEmail, rawResetToken] = sendSpy.mock.calls[0];
      expect(sentToEmail).toBe(user.email);
      expect(typeof rawResetToken).toBe('string');

      const resetRes = await request(app)
        .post('/api/reset-password')
        .send({ token: rawResetToken, password: 'BrandNewPassw0rd!' });
      expect(resetRes.status).toBe(200);

      // New password works.
      const loginRes = await request(app)
        .post('/api/login')
        .send({ email: user.email, password: 'BrandNewPassw0rd!' });
      expect(loginRes.status).toBe(200);
      expect(typeof loginRes.body.token).toBe('string');
      expect(typeof loginRes.body.refreshToken).toBe('string');

      // Old password no longer works.
      const oldPasswordRes = await request(app)
        .post('/api/login')
        .send({ email: user.email, password: 'OldPassw0rd!' });
      expect(oldPasswordRes.status).toBe(401);

      // The JWT issued before the reset is now rejected everywhere (S-13).
      const staleRes = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(staleRes.status).toBe(401);

      sendSpy.mockRestore();
    });

    it('rejects a reused/invalid reset token with 400 INVALID_TOKEN', async () => {
      const res = await request(app)
        .post('/api/reset-password')
        .send({ token: 'not-a-real-reset-token', password: 'SomePassw0rd!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('rejects a too-short new password with 400 VALIDATION_ERROR', async () => {
      const user = await insertUser(pool);
      const sendSpy = vi.spyOn(brevoConfig, 'sendPasswordResetEmail').mockResolvedValue(true);
      await request(app).post('/api/forgot-password').send({ email: user.email });
      const rawResetToken = sendSpy.mock.calls[0][1];

      const res = await request(app).post('/api/reset-password').send({ token: rawResetToken, password: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');

      sendSpy.mockRestore();
    });
  });

  // --- email change (S-27) --------------------------------------------------

  describe('POST /api/user-profile/email', () => {
    it('returns 409 EMAIL_TAKEN when the email belongs to another account', async () => {
      const userA = await insertUser(pool);
      const userB = await insertUser(pool);
      const tokenA = issueSessionToken({ id: userA.id, email: userA.email, token_version: 0 });

      const res = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: userB.email });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('on success: normalises the email, sets email_verified false, and sends a verification email', async () => {
      const user = await insertUser(pool);
      const token = issueSessionToken({ id: user.id, email: user.email, token_version: 0 });
      const newEmail = `  Changed-${Date.now()}@Example.com  `;
      const normalizedEmail = newEmail.trim().toLowerCase();

      const sendSpy = vi.spyOn(brevoConfig, 'sendVerificationEmail').mockResolvedValue(true);

      const res = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: newEmail });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.token).toBe('string');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0]).toBe(normalizedEmail);

      const row = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
      expect(row.rows[0].email).toBe(normalizedEmail);
      expect(row.rows[0].email_verified).toBe(false);

      sendSpy.mockRestore();
    });

    it('rejects a malformed email with 400 VALIDATION_ERROR', async () => {
      const user = await insertUser(pool);
      const token = issueSessionToken({ id: user.id, email: user.email, token_version: 0 });

      const res = await request(app)
        .post('/api/user-profile/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
