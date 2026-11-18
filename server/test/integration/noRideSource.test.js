const request = require('supertest');
const { bootstrap } = require('./setup');

// An account with no Strava is a normal account (docs/plans/auth-providers.md
// §3.6): someone who signed in with Apple, Google or email and has not
// connected a ride source. Walks every parameterless GET of the contract as
// such a rider — whatever a screen asks for on open — and holds two lines:
// never 401 (both clients read that as "session dead" and sign the rider
// out), never 5xx.
//
// Left out: admin (403 by design), weather (calls an external API), the
// provider callbacks that need a query to mean anything, and the two routes
// only a paired bike computer's device token may call.
const SKIPPED_DOMAINS = new Set(['admin', 'weather']);
const SKIPPED_PATHS = new Set([
  '/api/verify-email',
  '/api/auth/strava/link-start',
  '/api/oura/connect-state',
  '/api/garmin/home',
  '/api/garmin/week',
]);

describe('an account without a ride source', () => {
  let app, rider, endpoints;

  beforeAll(async () => {
    let pool;
    ({ app, pool } = await bootstrap());
    const { issueSessionToken } = require('../../lib/jwt');
    const shared = require('@bikelab/shared/api');

    const row = (
      await pool.query(
        "INSERT INTO users (email, email_verified, name, created_at) VALUES ($1, TRUE, 'No Strava', NOW()) RETURNING *",
        [`no-strava-${Date.now()}@example.com`]
      )
    ).rows[0];
    rider = { id: row.id, token: issueSessionToken(row) };

    endpoints = shared
      .listEndpoints(shared.contract)
      .filter(({ domain, def }) => def.method === 'GET' && def.auth && !def.sse && !def.path.includes(':') && !SKIPPED_DOMAINS.has(domain) && !SKIPPED_PATHS.has(def.path))
      .map(({ def }) => def.path);
  }, 30000);

  it('covers a meaningful share of the API', () => {
    expect(endpoints.length).toBeGreaterThan(25);
  });

  it('is never signed out and never gets a server error', async () => {
    const failures = [];
    for (const path of endpoints) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${rider.token}`);
      if (res.status === 401 || res.status >= 500) failures.push(`${res.status} ${path} ${JSON.stringify(res.body).slice(0, 160)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 60000);

  it('gets empty lists where rides would be', async () => {
    const auth = { Authorization: `Bearer ${rider.token}` };
    const activities = await request(app).get('/api/activities').set(auth);
    expect(activities.status).toBe(200);
    expect(activities.body).toEqual([]);

    const bikes = await request(app).get('/api/bikes').set(auth);
    expect(bikes.status).toBe(200);
    expect(bikes.body).toEqual([]);
  });

  it('gets 409 STRAVA_NOT_LINKED, not 401, for a single ride', async () => {
    const res = await request(app).get('/api/activities/123456').set('Authorization', `Bearer ${rider.token}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STRAVA_NOT_LINKED');
  });
});
