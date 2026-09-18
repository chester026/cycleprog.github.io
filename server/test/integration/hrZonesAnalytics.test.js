const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/analytics/hr-zones (T-6 follow-up to T-3.1/T-3.6): server-
// computed, persisted time-in-HR-zones against a real Postgres
// `activity_analysis` table (`kind = 'hr_histogram'`), replacing
// `HeartRateZonesChart.jsx`'s client-side per-activity streams downloads —
// per the "SQL changes need real-PG integration tests" rule. Same
// stravaHttp-monkeypatch technique as test/integration/ftpAnalysis.test.js.
describe('GET /api/analytics/hr-zones (server-computed HR histogram, real Postgres)', () => {
  let app, pool;
  let streamsByActivity;
  let streamsCallCount;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  beforeEach(() => {
    streamsByActivity = new Map();
    streamsCallCount = 0;
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) {
        return { data: [], headers: {} }; // never top up from Strava — activities are seeded directly
      }
      const match = String(url).match(/\/activities\/(\d+)\/streams/);
      if (match) {
        streamsCallCount += 1;
        const id = Number(match[1]);
        const fixture = streamsByActivity.get(id);
        if (!fixture) throw new Error(`no streams fixture registered for activity ${id}`);
        return { data: fixture, headers: {} };
      }
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  });

  async function linkStrava(userId) {
    await pool.query(
      `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
         strava_expires_at = $3 WHERE id = $1`,
      [userId, 757000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function seedActivities(userId, activities) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    await syncActivitiesToDb(userId, activities);
    require('../../services/strava/activities').invalidate(userId);
  }

  // Same "warm the recent-refresh throttle first" reasoning as
  // ftpAnalysis.test.js: the stubbed stravaHttp always returns an empty
  // activities page, which would otherwise prune every recently-dated
  // seeded activity as "deleted on Strava" on the route's first call.
  async function warmRecentRefreshThrottle(userId) {
    await require('../../services/strava/activities').getActivities(userId);
  }

  function rideFixture(idOffset, overrides = {}) {
    const daysAgo = 5 + idOffset;
    const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      id: 950000 + idOffset,
      name: `HR Ride ${idOffset}`,
      type: 'Ride',
      start_date: start.toISOString(),
      distance: 30000,
      moving_time: 3600,
      average_heartrate: 150,
      has_heartrate: true,
      total_elevation_gain: 0,
      average_speed: 30000 / 3600,
      max_speed: 12,
      ...overrides,
    };
  }

  // Heart-rate stream at 1Hz, constant bpm — enough to land in a single
  // predictable zone.
  function streamsFixture(seconds, bpm) {
    return {
      heartrate: { data: Array(seconds).fill(bpm) },
      time: { data: Array.from({ length: seconds }, (_, i) => i) },
    };
  }

  it('401s without auth', async () => {
    const res = await request(app).get('/api/analytics/hr-zones');
    expect(res.status).toBe(401);
  });

  it('computes correct seconds per zone from streams, then serves the second call from the cache', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);
    // Karvonen zones (max_hr/resting_hr set) via the real profile route —
    // same server-derived hr_zones GET /api/analytics/hr-zones consumes.
    await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ max_hr: 200, resting_hr: 50 });

    await seedActivities(user.id, [rideFixture(1)]);
    // Karvonen zone for a 200/50 profile: zone1 ~ [50,125], so 175bpm lands well into zone4/5.
    streamsByActivity.set(950001, streamsFixture(120, 175));

    const first = await request(app).get('/api/analytics/hr-zones').query({ period: '4w' }).set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);
    expect(first.body.period).toBe('4w');
    expect(first.body.coverage).toEqual({ total: 1, withStreams: 1, fallback: 0, pending: 0 });
    const totalSeconds = first.body.zones.reduce((sum, z) => sum + z.seconds, 0);
    expect(totalSeconds).toBe(119); // 120 samples -> 119 consecutive-pair intervals of 1s each
    expect(streamsCallCount).toBe(1);

    // Persisted as a zone-independent histogram, not zone-keyed.
    const row = await pool.query(
      `SELECT kind, result FROM activity_analysis WHERE user_id = $1 AND strava_id = $2`,
      [user.id, 950001]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].kind).toBe('hr_histogram');
    expect(row.rows[0].result.bins['175']).toBe(119);

    const second = await request(app).get('/api/analytics/hr-zones').query({ period: '4w' }).set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.coverage.withStreams).toBe(1);
    expect(streamsCallCount).toBe(1); // unchanged — served from the cache, no second stream fetch
  }, 20000);

  it('respects the per-request stream-fetch budget, leaving the rest pending', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);

    const { MAX_HR_STREAM_FETCHES_PER_REQUEST } = require('../../services/hrZones');
    const total = MAX_HR_STREAM_FETCHES_PER_REQUEST + 5;
    const rides = Array.from({ length: total }, (_, i) => rideFixture(20 + i));
    await seedActivities(user.id, rides);
    for (const ride of rides) streamsByActivity.set(ride.id, streamsFixture(60, 150));

    const res = await request(app).get('/api/analytics/hr-zones').query({ period: '1y' }).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.coverage.total).toBe(total);
    expect(res.body.coverage.withStreams).toBe(MAX_HR_STREAM_FETCHES_PER_REQUEST);
    expect(res.body.coverage.pending).toBe(5);
    expect(res.body.coverage.fallback).toBe(5);
    expect(streamsCallCount).toBe(MAX_HR_STREAM_FETCHES_PER_REQUEST);
  }, 20000);

  it('falls back to average_heartrate/moving_time for a ride whose stream fetch throws', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);
    await seedActivities(user.id, [rideFixture(3, { average_heartrate: 150, moving_time: 3600 })]);
    // No fixture registered for 950003 -> stravaHttp.request throws for it.

    const res = await request(app).get('/api/analytics/hr-zones').query({ period: '4w' }).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.coverage).toEqual({ total: 1, withStreams: 0, fallback: 1, pending: 0 });
    const totalSeconds = res.body.zones.reduce((sum, z) => sum + z.seconds, 0);
    expect(totalSeconds).toBe(3600);

    // A failed fetch is not persisted — nothing cached for this activity.
    const row = await pool.query(
      `SELECT 1 FROM activity_analysis WHERE user_id = $1 AND strava_id = $2`,
      [user.id, 950003]
    );
    expect(row.rows).toHaveLength(0);
  }, 20000);
});
