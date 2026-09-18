// LEGACY_MOBILE_COMPAT (config/index.js) — the shim that keeps the App
// Store build of BikeLabApp working against this server while the
// refactored build is in TestFlight. Covers the three guarded paths:
// state-less `?mobile=true` Strava callback → /auth/success page, and the
// two formerly client-written snapshot POSTs answering 200 (server-side
// computation) instead of 403 for a non-admin. The flag is read once at
// config require time, so it's set here BEFORE bootstrap() requires the
// server — each vitest file has its own module graph, so this doesn't
// leak into the other integration files (which run with it off and keep
// asserting the 403s in skills.test.js).
process.env.LEGACY_MOBILE_COMPAT = 'true';

const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Strava must never be called from the test suite: the two OAuth helpers
// the legacy callback uses are spied on the module object (CJS — vi.mock
// doesn't intercept `require`), required lazily after bootstrap like every
// other server module.
let stravaOAuth;

describe('LEGACY_MOBILE_COMPAT=true', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    stravaOAuth = require('../../services/strava/oauth');
    vi.spyOn(stravaOAuth, 'exchangeCode').mockResolvedValue({
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    vi.spyOn(stravaOAuth, 'getAthlete').mockResolvedValue({
      id: 987654321, firstname: 'Legacy', lastname: 'Rider', email: null, profile: null,
    });
  }, 30000);

  afterAll(() => vi.restoreAllMocks());

  it('GET /exchange_token?code=…&mobile=true without state logs in and redirects to /auth/success?token=', async () => {
    const res = await request(app).get('/exchange_token').query({ code: 'abc', mobile: 'true', scope: 'read' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/auth\/success\?token=/);

    const token = decodeURIComponent(res.headers.location.split('token=')[1]);
    // The token is a normal session JWT the store build can use as-is.
    const me = await request(app).get('/api/user-profile').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const row = await pool.query('SELECT id FROM users WHERE strava_athlete_id = $1', [987654321]);
    expect(row.rows.length).toBe(1);
  });

  it('GET /exchange_token with an invalid state is still rejected (400) — the shim only covers mobile=true', async () => {
    const res = await request(app).get('/exchange_token').query({ code: 'abc', state: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('GET /auth/success renders the bikelab://auth?token= deep link', async () => {
    const res = await request(app).get('/auth/success').query({ token: 'tok<en' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('bikelab://auth?token=tok%3Cen');
    expect(res.text).not.toContain('tok<en');
  });

  it('POST /api/skills-history from a non-admin answers 200 with server-computed skills', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/skills-history')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ user_id: user.id, climbing: 99, sprint: 99, endurance: 99, tempo: 99, power: 99, consistency: 99 });
    expect(res.status).toBe(200);
    expect(res.body.legacy).toBe(true);
    // Client numbers are discarded — a user with no Strava data scores 0.
    expect(res.body.climbing).not.toBe(99);
  });

  it('POST /api/analytics-snapshot from a non-admin answers 200', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/analytics-snapshot')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ lastActivityId: 1, power: { avg: 999 } });
    expect(res.status).toBe(200);
    expect(res.body.legacy).toBe(true);
  });
});
