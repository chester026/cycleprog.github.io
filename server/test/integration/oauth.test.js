const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { createAuthCode } = require('../../lib/oauthState');

// Only the "start" + "exchange" halves of the Strava OAuth flow (state
// minting/consuming, single-use auth codes) are testable without actually
// hitting Strava's API — this suite never calls stravaOAuth.exchangeCode /
// getAthlete, so it never reaches the real network, matching this suite's
// "Strava/OpenAI must never be called" requirement.
describe('Strava OAuth scaffolding', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
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
});
