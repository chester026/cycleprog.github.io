const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { bootstrap } = require('./setup');

// Sign in with Apple / Google (docs/plans/auth-providers.md §3.2–3.4).
//
// No network: the provider's signing keys are replaced by one RSA pair made
// here (services/identity/jwks.js is spied), so every token in this file is
// signed locally and verified by the real code path — signature, issuer,
// audience, expiry, nonce. Apple's token/revoke calls are spied the same way.
//
// Env below must be set before bootstrap(): config is read once, when the
// server is first required (see setup.js's header). Own worker, own
// authLimiter budget — raised, since every sign-in here spends it.
const APPLE_AUDIENCE = 'com.bikelab.test';
const GOOGLE_AUDIENCE = 'ios-test.apps.googleusercontent.com';
process.env.APPLE_BUNDLE_ID = APPLE_AUDIENCE;
process.env.APPLE_TEAM_ID = 'TEAM123456';
process.env.APPLE_KEY_ID = 'KEY1234567';
process.env.APPLE_PRIVATE_KEY = crypto
  .generateKeyPairSync('ec', { namedCurve: 'P-256' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.GOOGLE_CLIENT_IDS = `${GOOGLE_AUDIENCE}, web-test.apps.googleusercontent.com`;
process.env.IDENTITY_TOKEN_ENC_KEY = 'ab'.repeat(32);
process.env.AUTH_RATE_LIMIT_MAX = '500';

const KID = 'test-kid';
const signingKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const strangerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sign(claims, { key = signingKeys.privateKey, kid = KID, expiresIn = '10m' } = {}) {
  return jwt.sign(claims, key, { algorithm: 'RS256', keyid: kid, expiresIn });
}

// What the iOS SDK produces: the nonce reaches Apple hashed.
function appleToken({ sub, email, nonce, ...claims }, options) {
  return sign(
    { iss: 'https://appleid.apple.com', aud: APPLE_AUDIENCE, sub, email, email_verified: 'true', nonce: sha256(nonce), ...claims },
    options
  );
}

function googleToken({ sub, email, ...claims }, options) {
  return sign({ iss: 'https://accounts.google.com', aud: GOOGLE_AUDIENCE, sub, email, email_verified: true, ...claims }, options);
}

describe('sign in with Apple / Google', () => {
  let app, pool, issueSessionToken, apple, secretBox;

  async function nonce() {
    const res = await request(app).get('/api/auth/nonce');
    expect(res.status).toBe(200);
    return res.body.nonce;
  }

  async function appleSignIn(identity, body = {}) {
    const value = await nonce();
    return request(app)
      .post('/api/auth/apple')
      .send({ identityToken: appleToken({ ...identity, nonce: value }), nonce: value, ...body });
  }

  function googleSignIn(identity) {
    return request(app).post('/api/auth/google').send({ idToken: googleToken(identity) });
  }

  async function insertUser({ email = null, password = null, emailVerified = false, stravaAthleteId = null } = {}) {
    const passwordHash = password ? await bcrypt.hash(password, 4) : null;
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, strava_id, strava_athlete_id, name, created_at)
       VALUES ($1, $2, $3, $4, $4, 'Existing Rider', NOW())
       RETURNING *`,
      [email, passwordHash, emailVerified, stravaAthleteId]
    );
    const user = result.rows[0];
    return { ...user, token: issueSessionToken(user) };
  }

  const identitiesOf = async (userId) =>
    (await pool.query('SELECT * FROM user_identities WHERE user_id = $1 ORDER BY id', [userId])).rows;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ issueSessionToken } = require('../../lib/jwt'));
    apple = require('../../services/identity/apple');
    secretBox = require('../../lib/secretBox');
    const jwks = require('../../services/identity/jwks');
    vi.spyOn(jwks, 'getSigningKey').mockImplementation(async (url, kid) => (kid === KID ? signingKeys.publicKey : null));
  }, 30000);

  beforeEach(() => {
    vi.spyOn(apple, 'exchangeAuthorizationCode').mockResolvedValue(null);
    vi.spyOn(apple, 'revokeRefreshToken').mockResolvedValue(true);
  });

  it('GET /api/auth/providers reports what is configured', async () => {
    const res = await request(app).get('/api/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ apple: true, google: true });
  });

  describe('Apple', () => {
    it('creates an account on first sign-in, with the name the client forwarded', async () => {
      const sub = unique('apple');
      const email = `${sub}@privaterelay.appleid.com`;
      apple.exchangeAuthorizationCode.mockResolvedValue('apple-refresh-token');

      const res = await appleSignIn({ sub, email }, {
        authorizationCode: 'one-time-code',
        fullName: { givenName: 'Ada', familyName: 'Lovelace' },
      });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email, avatar: null });
      expect(typeof res.body.refreshToken).toBe('string');

      const user = (await pool.query('SELECT * FROM users WHERE id = $1', [res.body.user.id])).rows[0];
      expect(user).toMatchObject({ email_verified: true, password_hash: null, strava_id: null });

      const [identity] = await identitiesOf(user.id);
      expect(identity).toMatchObject({ provider: 'apple', provider_user_id: sub, client_id: APPLE_AUDIENCE });
      // Stored sealed, never as Apple sent it.
      expect(identity.refresh_token).not.toContain('apple-refresh-token');
      expect(secretBox.open(identity.refresh_token)).toBe('apple-refresh-token');
      expect(apple.exchangeAuthorizationCode).toHaveBeenCalledWith('one-time-code', APPLE_AUDIENCE);

      const methods = await request(app).get('/api/auth/identities').set('Authorization', `Bearer ${res.body.token}`);
      expect(methods.status).toBe(200);
      expect(methods.body).toMatchObject({ has_password: false, needs_sign_in_method: false });
      expect(methods.body.methods.map((m) => m.provider)).toEqual(['apple']);
    });

    it('signs the same identity into the same account the second time', async () => {
      const sub = unique('apple');
      const first = await appleSignIn({ sub, email: `${sub}@example.com` });
      const second = await appleSignIn({ sub, email: `${sub}@example.com` });

      expect(second.status).toBe(200);
      expect(second.body.isNewUser).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(await identitiesOf(first.body.user.id)).toHaveLength(1);
    });

    it('accepts a nonce only once', async () => {
      const sub = unique('apple');
      const value = await nonce();
      const body = { identityToken: appleToken({ sub, nonce: value }), nonce: value };

      expect((await request(app).post('/api/auth/apple').send(body)).status).toBe(200);
      const replay = await request(app).post('/api/auth/apple').send(body);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('INVALID_NONCE');
    });

    it('refuses a nonce this server did not issue', async () => {
      const value = 'f'.repeat(64);
      const res = await request(app)
        .post('/api/auth/apple')
        .send({ identityToken: appleToken({ sub: unique('apple'), nonce: value }), nonce: value });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_NONCE');
    });

    it.each([
      ['a token bound to another nonce', (value) => appleToken({ sub: 's', nonce: `${value}-other` })],
      ['a token for another app', (value) => appleToken({ sub: 's', nonce: value, aud: 'com.someone.else' })],
      ['a token from another issuer', (value) => appleToken({ sub: 's', nonce: value, iss: 'https://accounts.google.com' })],
      ['an expired token', (value) => appleToken({ sub: 's', nonce: value }, { expiresIn: -60 })],
      ['a token signed by an unknown key id', (value) => appleToken({ sub: 's', nonce: value }, { kid: 'rotated-away' })],
      ['a token signed by someone else under our key id', (value) => appleToken({ sub: 's', nonce: value }, { key: strangerKeys.privateKey })],
      ['an HS256 token', (value) => jwt.sign({ iss: 'https://appleid.apple.com', aud: APPLE_AUDIENCE, sub: 's', nonce: sha256(value) }, 'secret', { keyid: KID })],
      ['something that is not a JWT', () => 'not-a-token'],
    ])('rejects %s', async (_label, makeToken) => {
      const value = await nonce();
      const res = await request(app).post('/api/auth/apple').send({ identityToken: makeToken(value), nonce: value });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_ID_TOKEN');
    });
  });

  describe('Google', () => {
    it('creates an account with the name and picture from the token, without a nonce', async () => {
      const sub = unique('google');
      const email = `${sub}@gmail.com`;
      const res = await googleSignIn({ sub, email: email.toUpperCase(), name: 'Grace Hopper', picture: 'https://lh3.example/p.jpg' });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user).toMatchObject({ name: 'Grace Hopper', email, avatar: 'https://lh3.example/p.jpg' });

      const user = (await pool.query('SELECT avatar_source, email_verified FROM users WHERE id = $1', [res.body.user.id])).rows[0];
      expect(user).toEqual({ avatar_source: 'google', email_verified: true });
    });

    it('checks the nonce when the client sends one', async () => {
      const sub = unique('google');
      const value = await nonce();
      const ok = await request(app).post('/api/auth/google').send({ idToken: googleToken({ sub, nonce: value }), nonce: value });
      expect(ok.status).toBe(200);

      const other = await nonce();
      const mismatch = await request(app)
        .post('/api/auth/google')
        .send({ idToken: googleToken({ sub, nonce: 'bound-to-something-else' }), nonce: other });
      expect(mismatch.status).toBe(401);
      expect(mismatch.body.code).toBe('INVALID_ID_TOKEN');
    });

    // Google's iOS SDK generates a nonce itself and puts it into every
    // token; the app never sees it, so there is nothing to send or compare.
    it('accepts a token carrying the SDK\'s own nonce when the client sent none', async () => {
      const res = await request(app).post('/api/auth/google').send({ idToken: googleToken({ sub: unique('google'), nonce: 'made-by-the-sdk' }) });
      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(true);
    });

    it('rejects a token issued for another client id', async () => {
      const res = await googleSignIn({ sub: unique('google'), aud: 'someone-else.apps.googleusercontent.com' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_ID_TOKEN');
    });
  });

  describe('which account an identity resolves to', () => {
    it('joins the account that has itself verified the same address', async () => {
      const email = `${unique('owner')}@example.com`;
      const owner = await insertUser({ email, password: 'Sup3rSecret!', emailVerified: true });

      const res = await googleSignIn({ sub: unique('google'), email, name: 'Ignored Name' });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(false);
      expect(res.body.user).toMatchObject({ id: owner.id, name: 'Existing Rider' });

      const methods = await request(app).get('/api/auth/identities').set('Authorization', `Bearer ${res.body.token}`);
      expect(methods.body).toMatchObject({ has_password: true, needs_sign_in_method: false });
      expect(methods.body.methods.map((m) => m.provider)).toEqual(['google']);
    });

    it('does not follow an address the account never verified, and leaves that account alone', async () => {
      const email = `${unique('typed')}@example.com`;
      const other = await insertUser({ email, emailVerified: false, stravaAthleteId: Date.now() });

      const res = await googleSignIn({ sub: unique('google'), email });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user.id).not.toBe(other.id);
      // The address is held by the other row, so the new account starts without it.
      expect(res.body.user.email).toBeNull();

      const untouched = (await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [other.id])).rows[0];
      expect(untouched).toEqual({ email, email_verified: false });
      expect(await identitiesOf(other.id)).toHaveLength(0);
    });

    it('does not follow an address the provider has not verified', async () => {
      const email = `${unique('owner')}@example.com`;
      const owner = await insertUser({ email, password: 'Sup3rSecret!', emailVerified: true });

      const res = await googleSignIn({ sub: unique('google'), email, email_verified: false });

      expect(res.status).toBe(200);
      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user.id).not.toBe(owner.id);
      expect(await identitiesOf(owner.id)).toHaveLength(0);
    });

    it('resolves two racing first sign-ins of one identity to one account', async () => {
      const sub = unique('google');
      const [a, b] = await Promise.all([
        googleSignIn({ sub, email: `${sub}@gmail.com` }),
        googleSignIn({ sub, email: `${sub}@gmail.com` }),
      ]);

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.user.id).toBe(b.body.user.id);
      const rows = await pool.query("SELECT 1 FROM user_identities WHERE provider = 'google' AND provider_user_id = $1", [sub]);
      expect(rows.rowCount).toBe(1);
    });
  });

  describe('sign-in methods of an account', () => {
    it('reports a Strava-only account as needing a sign-in method', async () => {
      const rider = await insertUser({ stravaAthleteId: Date.now() });
      const res = await request(app).get('/api/auth/identities').set('Authorization', `Bearer ${rider.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ methods: [], has_password: false, needs_sign_in_method: true });
    });

    it('attaches Apple to a Strava-only account, which then signs in with Apple', async () => {
      const rider = await insertUser({ stravaAthleteId: Date.now() });
      const sub = unique('apple');
      const email = `${sub}@icloud.com`;

      const value = await nonce();
      const attach = await request(app)
        .post('/api/auth/identities/apple')
        .set('Authorization', `Bearer ${rider.token}`)
        .send({ identityToken: appleToken({ sub, email, nonce: value }), nonce: value });

      expect(attach.status).toBe(200);
      expect(attach.body).toMatchObject({ has_password: false, needs_sign_in_method: false });
      expect(attach.body.methods).toHaveLength(1);

      // The account had no address; the provider-verified one fills it.
      const row = (await pool.query('SELECT email, email_verified, name FROM users WHERE id = $1', [rider.id])).rows[0];
      expect(row).toEqual({ email, email_verified: true, name: 'Existing Rider' });

      const signIn = await appleSignIn({ sub, email });
      expect(signIn.body).toMatchObject({ isNewUser: false, user: { id: rider.id } });
    });

    it('is idempotent for an identity the account already has', async () => {
      const sub = unique('google');
      const first = await googleSignIn({ sub });
      const again = await request(app)
        .post('/api/auth/identities/google')
        .set('Authorization', `Bearer ${first.body.token}`)
        .send({ idToken: googleToken({ sub }) });
      expect(again.status).toBe(200);
      expect(again.body.methods).toHaveLength(1);
    });

    it('refuses an identity that belongs to another account', async () => {
      const sub = unique('google');
      await googleSignIn({ sub });
      const rider = await insertUser({ stravaAthleteId: Date.now() });

      const res = await request(app)
        .post('/api/auth/identities/google')
        .set('Authorization', `Bearer ${rider.token}`)
        .send({ idToken: googleToken({ sub }) });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDENTITY_TAKEN');
      expect(await identitiesOf(rider.id)).toHaveLength(0);
    });

    it('refuses a second identity of the same provider', async () => {
      const first = await googleSignIn({ sub: unique('google') });
      const res = await request(app)
        .post('/api/auth/identities/google')
        .set('Authorization', `Bearer ${first.body.token}`)
        .send({ idToken: googleToken({ sub: unique('google') }) });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PROVIDER_ALREADY_LINKED');
    });

    it('needs a session', async () => {
      const res = await request(app).post('/api/auth/identities/google').send({ idToken: googleToken({ sub: unique('google') }) });
      expect(res.status).toBe(401);
    });

    it('never removes the last sign-in method', async () => {
      const signIn = await googleSignIn({ sub: unique('google') });
      const res = await request(app).delete('/api/auth/identities/google').set('Authorization', `Bearer ${signIn.body.token}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LAST_SIGN_IN_METHOD');
      expect(await identitiesOf(signIn.body.user.id)).toHaveLength(1);
    });

    it('does not count a password behind an unverified address as a way in', async () => {
      const rider = await insertUser({ email: `${unique('unverified')}@example.com`, password: 'Sup3rSecret!', emailVerified: false });
      const auth = { Authorization: `Bearer ${rider.token}` };
      await request(app).post('/api/auth/identities/google').set(auth).send({ idToken: googleToken({ sub: unique('google') }) });

      const res = await request(app).delete('/api/auth/identities/google').set(auth);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LAST_SIGN_IN_METHOD');
    });

    it('removes a method when another is left, revoking the Apple grant', async () => {
      const sub = unique('apple');
      apple.exchangeAuthorizationCode.mockResolvedValue('refresh-to-revoke');
      const signIn = await appleSignIn({ sub }, { authorizationCode: 'code' });
      const auth = { Authorization: `Bearer ${signIn.body.token}` };
      await request(app).post('/api/auth/identities/google').set(auth).send({ idToken: googleToken({ sub: unique('google') }) });

      const res = await request(app).delete('/api/auth/identities/apple').set(auth);

      expect(res.status).toBe(200);
      expect(res.body.methods.map((m) => m.provider)).toEqual(['google']);
      expect(apple.revokeRefreshToken).toHaveBeenCalledWith('refresh-to-revoke', APPLE_AUDIENCE);
    });

    it('answers 404 for a method the account does not have, 400 for an unknown provider', async () => {
      const signIn = await googleSignIn({ sub: unique('google') });
      const auth = { Authorization: `Bearer ${signIn.body.token}` };

      const missing = await request(app).delete('/api/auth/identities/apple').set(auth);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('IDENTITY_NOT_FOUND');

      const unknown = await request(app).delete('/api/auth/identities/strava').set(auth);
      expect(unknown.status).toBe(400);
      expect(unknown.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // Owner decision 2026-11-18: the account owns its name and picture;
  // connecting Strava fills what is missing and takes back only what it gave.
  describe('name and avatar when Strava is connected', () => {
    const strava = (id) => ({ id, firstname: 'Strava', lastname: 'Name', profile: 'https://strava.example/a.jpg' });
    const tokens = { access_token: 'a', refresh_token: 'r', expires_at: 4102444800 };
    const profileOf = async (userId) =>
      (await pool.query('SELECT name, avatar, avatar_source FROM users WHERE id = $1', [userId])).rows[0];

    it('keeps a Google rider\'s name and picture, through connect and disconnect', async () => {
      const authService = require('../../services/auth');
      const usersRepo = require('../../repositories/users');
      const signIn = await googleSignIn({ sub: unique('google'), name: 'Grace Hopper', picture: 'https://lh3.example/g.jpg' });
      const userId = signIn.body.user.id;

      await authService.linkStravaAccount(userId, strava(Date.now()), tokens);
      expect(await profileOf(userId)).toEqual({ name: 'Grace Hopper', avatar: 'https://lh3.example/g.jpg', avatar_source: 'google' });

      await usersRepo.clearStravaLink(userId);
      expect(await profileOf(userId)).toEqual({ name: 'Grace Hopper', avatar: 'https://lh3.example/g.jpg', avatar_source: 'google' });
    });

    it('gives an Apple rider Strava\'s picture, and takes it back on disconnect', async () => {
      const authService = require('../../services/auth');
      const usersRepo = require('../../repositories/users');
      const signIn = await appleSignIn({ sub: unique('apple') }, { fullName: { givenName: 'Ada', familyName: 'Lovelace' } });
      const userId = signIn.body.user.id;

      await authService.linkStravaAccount(userId, strava(Date.now() + 1), tokens);
      expect(await profileOf(userId)).toEqual({ name: 'Ada Lovelace', avatar: 'https://strava.example/a.jpg', avatar_source: 'strava' });

      await usersRepo.clearStravaLink(userId);
      expect(await profileOf(userId)).toEqual({ name: 'Ada Lovelace', avatar: null, avatar_source: null });
    });

    it('still follows Strava for a Strava-first account, as before', async () => {
      const authService = require('../../services/auth');
      const athleteId = Date.now() + 2;
      const created = await authService.findOrCreateStravaUser(strava(athleteId), tokens);
      expect(await profileOf(created.id)).toEqual({ name: 'Strava Name', avatar: 'https://strava.example/a.jpg', avatar_source: 'strava' });

      await authService.findOrCreateStravaUser({ id: athleteId, firstname: 'Renamed', lastname: '', profile: 'https://strava.example/b.jpg' }, tokens);
      expect(await profileOf(created.id)).toEqual({ name: 'Renamed', avatar: 'https://strava.example/b.jpg', avatar_source: 'strava' });
    });
  });

  describe('account deletion', () => {
    it('revokes the Apple grant and drops the identity with the account', async () => {
      const sub = unique('apple');
      apple.exchangeAuthorizationCode.mockResolvedValue('refresh-of-deleted-account');
      const signIn = await appleSignIn({ sub }, { authorizationCode: 'code' });

      const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${signIn.body.token}`);

      expect(res.status).toBe(200);
      expect(apple.revokeRefreshToken).toHaveBeenCalledWith('refresh-of-deleted-account', APPLE_AUDIENCE);
      expect(await identitiesOf(signIn.body.user.id)).toHaveLength(0);
    });

    it('still deletes the account when Apple refuses the revoke', async () => {
      apple.exchangeAuthorizationCode.mockResolvedValue('refresh');
      apple.revokeRefreshToken.mockResolvedValue(false);
      const signIn = await appleSignIn({ sub: unique('apple') }, { authorizationCode: 'code' });

      const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${signIn.body.token}`);

      expect(res.status).toBe(200);
      const row = await pool.query('SELECT 1 FROM users WHERE id = $1', [signIn.body.user.id]);
      expect(row.rowCount).toBe(0);
    });
  });
});
