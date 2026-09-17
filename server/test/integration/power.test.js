const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/activities' `estimated_power` + GET /api/analytics/summary's
// `power` (T-3.5, docs/audit/00-AUDIT-AND-PLAN.md T-3.5) against a real
// Postgres `synced_activities.estimated_power` column (migration
// `1758000000003_estimated-power.sql`) — per the "SQL changes need real-PG
// integration tests" rule.
//
// Activities are seeded directly into `synced_activities` (same technique
// as skills.test.js/goalsProgress.test.js) with the user given
// fake-but-valid Strava tokens and `stravaHttp` monkey-patched to return an
// empty page, so `getActivities`'s "top up from Strava" call never hits the
// network. Seeded activities are dated well over 60 days ago (T-3.5's wind
// lookback window) specifically so this suite's weather assertions
// (`weatherCalls` stays 0) hold regardless of `services/weather.js`'s own
// network behavior — nothing here should ever call Open-Meteo.
describe('estimated_power (server-computed, real Postgres)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) {
        return { data: [], headers: {} };
      }
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  }, 30000);

  let weatherCalls;
  beforeEach(() => {
    weatherCalls = 0;
    const weatherService = require('../../services/weather');
    weatherService.getWindForActivity = async () => {
      weatherCalls += 1;
      throw new Error('this test suite must never need wind — all seeded activities are >60 days old');
    };
  });

  async function linkStrava(userId) {
    await pool.query(
      `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
         strava_expires_at = $3 WHERE id = $1`,
      [userId, 755000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function setWeight(userId, weight) {
    await pool.query(
      `INSERT INTO user_profiles (user_id, weight, bike_weight) VALUES ($1, $2, 8)
       ON CONFLICT (user_id) DO UPDATE SET weight = EXCLUDED.weight, bike_weight = EXCLUDED.bike_weight`,
      [userId, weight]
    );
  }

  async function seedActivities(userId, activities) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    await syncActivitiesToDb(userId, activities);
    require('../../services/strava/activities').invalidate(userId);
  }

  function rideFixture(idOffset, overrides = {}) {
    const daysAgo = 90 + idOffset; // well outside both the 30d prune window and the 60d wind window
    const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      id: 800000 + idOffset,
      name: `Ride ${idOffset}`,
      type: 'Ride',
      start_date: start.toISOString(),
      distance: 20000,
      moving_time: 2400,
      total_elevation_gain: 0,
      average_speed: 20000 / 2400,
      max_speed: 12,
      ...overrides,
    };
  }

  it('GET /api/activities attaches a measured estimated_power for a device_watts ride and an estimated one otherwise', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await setWeight(user.id, 70);
    await seedActivities(user.id, [
      rideFixture(1, { average_watts: 220, device_watts: true }),
      rideFixture(2),
    ]);

    const res = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const measured = res.body.find((a) => a.id === 800001);
    const estimated = res.body.find((a) => a.id === 800002);
    expect(measured.estimated_power.method).toBe('measured');
    expect(measured.estimated_power.avgWatts).toBe(220);
    expect(estimated.estimated_power.method).toBe('estimated');
    expect(estimated.estimated_power.avgWatts).toBeGreaterThan(0);
    expect(weatherCalls).toBe(0); // both rides are >60 days old — no wind call should happen

    // Persisted, not just computed in memory: a fresh SELECT sees the same
    // JSONB column value this response used.
    const row = await pool.query('SELECT estimated_power FROM synced_activities WHERE user_id = $1 AND strava_id = 800002', [
      user.id,
    ]);
    expect(row.rows[0].estimated_power.avgWatts).toBe(estimated.estimated_power.avgWatts);
  }, 15000);

  it('GET /api/analytics/summary exposes a numeric summary.power.avg built from the persisted estimates', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await setWeight(user.id, 70);
    await seedActivities(user.id, [rideFixture(11), rideFixture(12), rideFixture(13, { average_watts: 250, device_watts: true })]);

    // Warm GET /api/activities first so estimated_power is persisted, same
    // as a real client would (activities screen loads before analytics).
    await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);

    const res = await request(app)
      .get('/api/analytics/summary')
      .query({ period: 'all' })
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeTruthy();
    expect(res.body.summary.power).toBeTruthy();
    expect(typeof res.body.summary.power.avg).toBe('number');
    expect(res.body.summary.power.activitiesWithRealPower).toBe(1);
  }, 15000);

  it('does not recompute estimated_power on a second GET /api/activities (computedAt is stable)', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await setWeight(user.id, 70);
    await seedActivities(user.id, [rideFixture(21)]);

    const first = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
    const firstComputedAt = first.body[0].estimated_power.computedAt;

    // Force a fresh DB read (bypassing the in-memory activities cache) the
    // way a real cache-expiry or restart would, without waiting out the TTL.
    require('../../services/strava/activities').invalidate(user.id);

    const second = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
    expect(second.body[0].estimated_power.computedAt).toBe(firstComputedAt);
    expect(weatherCalls).toBe(0);
  }, 15000);
});
