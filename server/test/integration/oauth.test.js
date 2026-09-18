const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
// Required lazily (after bootstrap) — anything under server/ pulls in
// ../config, which must only be evaluated once setup.js has pointed the env
// at the scratch database.
let createAuthCode, createState, issuePurposeToken, issueSessionToken;

// Inserts a verified user directly (no POST /api/login round-trip) and
// returns {id, email, token}. Most tests below only need a userId (or a
// session JWT to satisfy authMiddleware) — not an exercise of the login
// endpoint itself — and /api/login/ /api/auth/exchange/ /api/auth/strava/
// start all share authLimiter's per-file quota (max 10/15min) with every
// other authLimiter-guarded call in this file, so tests that aren't
// specifically about login use this instead of helpers.js's createUser.
async function insertUser(pool) {
  const email = `oauth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, created_at)
     VALUES ($1, 'x', 'OAuth Test User', true, NOW())
     RETURNING id, email`,
    [email]
  );
  const user = result.rows[0];
  return { id: user.id, email: user.email, token: issueSessionToken({ id: user.id, email: user.email }) };
}

// Only the "start" + "exchange" halves of the Strava OAuth flow (state
// minting/consuming, single-use auth codes) are testable without actually
// hitting Strava's API — this suite never calls stravaOAuth.exchangeCode /
// getAthlete, so it never reaches the real network, matching this suite's
// "Strava/OpenAI must never be called" requirement.
describe('Strava OAuth scaffolding', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ createAuthCode, createState } = require('../../lib/oauthState'));
    ({ issuePurposeToken, issueSessionToken } = require('../../lib/jwt'));
  }, 30000);

  it('GET /api/auth/strava/start returns an authorize url with a state that exists in oauth_states', async () => {
    const res = await request(app).get('/api/auth/strava/start').query({ client: 'web' });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('state=');

    const state = new URL(res.body.url).searchParams.get('state');
    const row = await pool.query('SELECT purpose, client FROM oauth_states WHERE state = $1', [state]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].purpose).toBe('login');
    expect(row.rows[0].client).toBe('web');
  });

  it('POST /api/auth/exchange with a bad code returns 400', async () => {
    const res = await request(app).post('/api/auth/exchange').send({ code: 'bad' });
    expect(res.status).toBe(400);
  });

  it('a real auth code exchanges for a token exactly once (single-use)', async () => {
    const userA = await createUser(pool, app, request);
    const code = await createAuthCode(pool, userA.id);

    const firstExchange = await request(app).post('/api/auth/exchange').send({ code });
    expect(firstExchange.status).toBe(200);
    expect(typeof firstExchange.body.token).toBe('string');

    const secondExchange = await request(app).post('/api/auth/exchange').send({ code });
    expect(secondExchange.status).toBe(400);
  });

  it('GET /api/auth/strava/link-start without a token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/strava/link-start');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/auth/strava/link-start with a token returns an authorize url with a "link" state carrying the userId', async () => {
    const user = await insertUser(pool);
    const res = await request(app)
      .get('/api/auth/strava/link-start')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ client: 'web' });
    expect(res.status).toBe(200);
    const state = new URL(res.body.url).searchParams.get('state');
    const row = await pool.query('SELECT purpose, user_id FROM oauth_states WHERE state = $1', [state]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].purpose).toBe('link');
    expect(String(row.rows[0].user_id)).toBe(String(user.id));
  });
});

describe('Strava OAuth login callback (/exchange_token)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ createAuthCode, createState } = require('../../lib/oauthState'));
    ({ issuePurposeToken, issueSessionToken } = require('../../lib/jwt'));
  }, 30000);

  it('with no code, falls through to the SPA (never 400s on its own)', async () => {
    const res = await request(app).get('/exchange_token');
    // No `code` means "not a Strava redirect" — the handler calls next()
    // and the SPA/static fallback takes over; whatever that returns, it's
    // not this route treating a plain visit as an error.
    expect(res.status).not.toBe(500);
  });

  it('with a code and an invalid state returns 400', async () => {
    const res = await request(app).get('/exchange_token').query({ code: 'irrelevant', state: 'not-a-real-state' });
    expect(res.status).toBe(400);
  });

  it('with a code but NO state falls through to the SPA (production: FRONTEND_URL is this host, so the SPA\'s own /exchange_token?code= redirect lands here)', async () => {
    const res = await request(app).get('/exchange_token').query({ code: 'an-auth-code' });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(500);
  });

  it('completes the login round-trip for a brand-new Strava athlete (mocked Strava API)', async () => {
    const stravaOAuth = require('../../services/strava/oauth');
    // A fresh numeric id per run — this suite's users table is a real,
    // persistent database (unique per BIKELAB_IT_DB is NOT what isolates
    // this data; see test/integration/setup.js), so a hardcoded strava_id
    // would collide with a leftover row from an earlier run.
    const stravaId = Date.now() * 10 + 1;
    const exchangeSpy = vi.spyOn(stravaOAuth, 'exchangeCode').mockResolvedValue({
      access_token: 'at-1', refresh_token: 'rt-1', expires_at: 9999999999,
    });
    const athleteSpy = vi.spyOn(stravaOAuth, 'getAthlete').mockResolvedValue({
      id: stravaId, email: `athlete-${stravaId}@example.com`, firstname: 'Ada', lastname: 'Lovelace', profile: 'http://x/avatar.png',
    });

    const state = await createState(pool, { purpose: 'login', client: 'web' });
    const res = await request(app).get('/exchange_token').query({ code: 'good-code', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/exchange_token\?code=/);

    const row = await pool.query('SELECT * FROM users WHERE strava_id = $1', [String(stravaId)]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].email).toBe(`athlete-${stravaId}@example.com`);

    exchangeSpy.mockRestore();
    athleteSpy.mockRestore();
  });
});

describe('Oura OAuth callback (/oura/exchange_token)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ createAuthCode, createState } = require('../../lib/oauthState'));
    ({ issuePurposeToken, issueSessionToken } = require('../../lib/jwt'));
  }, 30000);

  it('with missing code/state returns 400', async () => {
    const res = await request(app).get('/oura/exchange_token');
    expect(res.status).toBe(400);
  });

  it('with an invalid/expired state token returns 400', async () => {
    const res = await request(app).get('/oura/exchange_token').query({ code: 'x', state: 'not-a-real-jwt' });
    expect(res.status).toBe(400);
  });

  it('with an oauthError query param returns 400', async () => {
    const res = await request(app).get('/oura/exchange_token').query({ error: 'access_denied' });
    expect(res.status).toBe(400);
  });

  it('connects Oura for the user carried in the state token (mocked Oura API)', async () => {
    const ouraService = require('../../ouraService');
    const exchangeSpy = vi.spyOn(ouraService, 'exchangeCodeForToken').mockResolvedValue({
      access_token: 'oura-at', refresh_token: 'oura-rt', expires_in: 3600,
    });
    const personalSpy = vi.spyOn(ouraService, 'fetchPersonalInfo').mockResolvedValue({ id: 'oura-user-1' });
    const cacheSpy = vi.spyOn(ouraService, 'fetchAndCacheOuraData').mockResolvedValue(undefined);

    const user = await insertUser(pool);
    const state = issuePurposeToken(user.id, 'oura_connect');

    const res = await request(app).get('/oura/exchange_token').query({ code: 'good-code', state });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Oura Connected');

    const row = await pool.query('SELECT oura_access_token, oura_user_id FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].oura_access_token).toBe('oura-at');
    expect(row.rows[0].oura_user_id).toBe('oura-user-1');

    exchangeSpy.mockRestore();
    personalSpy.mockRestore();
    cacheSpy.mockRestore();
  });
});

describe('Strava link callback (/link_strava)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ createAuthCode, createState } = require('../../lib/oauthState'));
    ({ issuePurposeToken, issueSessionToken } = require('../../lib/jwt'));
  }, 30000);

  it('with missing code/state returns 400', async () => {
    const res = await request(app).get('/link_strava');
    expect(res.status).toBe(400);
  });

  it('with an invalid/expired state returns 400', async () => {
    const res = await request(app).get('/link_strava').query({ code: 'x', state: 'not-a-real-state' });
    expect(res.status).toBe(400);
  });

  it('links Strava onto the user carried in the state (mocked Strava API)', async () => {
    const stravaOAuth = require('../../services/strava/oauth');
    const stravaId = Date.now() * 10 + 2;
    const exchangeSpy = vi.spyOn(stravaOAuth, 'exchangeCode').mockResolvedValue({
      access_token: 'link-at', refresh_token: 'link-rt', expires_at: 9999999999,
    });
    const athleteSpy = vi.spyOn(stravaOAuth, 'getAthlete').mockResolvedValue({
      id: stravaId, email: null, firstname: 'Grace', lastname: 'Hopper', profile: null,
    });

    const user = await insertUser(pool);
    const state = await createState(pool, { purpose: 'link', userId: user.id, client: 'web' });

    const res = await request(app).get('/link_strava').query({ code: 'good-code', state });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Strava Connected Successfully');

    const row = await pool.query('SELECT strava_id FROM users WHERE id = $1', [user.id]);
    expect(row.rows[0].strava_id).toBe(String(stravaId));

    exchangeSpy.mockRestore();
    athleteSpy.mockRestore();
  });

  it('refuses to link a Strava account already linked to another user', async () => {
    const stravaOAuth = require('../../services/strava/oauth');
    const exchangeSpy = vi.spyOn(stravaOAuth, 'exchangeCode').mockResolvedValue({
      access_token: 'at', refresh_token: 'rt', expires_at: 9999999999,
    });
    const conflictingStravaId = String(Date.now() * 10 + 3);
    const athleteSpy = vi.spyOn(stravaOAuth, 'getAthlete').mockResolvedValue({
      id: conflictingStravaId, email: null, firstname: 'Grace', lastname: 'Hopper', profile: null,
    });

    const alreadyLinkedUser = await insertUser(pool);
    await pool.query('UPDATE users SET strava_id = $1, strava_athlete_id = $1 WHERE id = $2', [conflictingStravaId, alreadyLinkedUser.id]);

    const otherUser = await insertUser(pool);
    const state = await createState(pool, { purpose: 'link', userId: otherUser.id, client: 'web' });

    const res = await request(app).get('/link_strava').query({ code: 'good-code', state });
    expect(res.status).toBe(400);
    expect(res.text).toContain('already linked to another user');

    exchangeSpy.mockRestore();
    athleteSpy.mockRestore();
  });
});
