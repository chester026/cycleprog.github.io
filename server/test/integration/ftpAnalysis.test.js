const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/activities/:id/ftp-analysis + GET /api/analytics/ftp (T-3.6,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-
// layer.md §4.6, docs/audit/layers/02-bikelabapp.md A-04) against a real
// Postgres `activity_analysis` table (migration
// `1758000000004_activity-analysis.sql`) — per the "SQL changes need
// real-PG integration tests" rule.
//
// Same technique as power.test.js: activities are seeded directly into
// `synced_activities`, the user is given fake-but-valid Strava tokens, and
// `stravaHttp` is monkey-patched so both the "list activities" call and the
// "get streams for activity N" call are served from an in-memory fixture
// instead of hitting the real network.
describe('FTP / high-intensity-interval analysis (server-computed, real Postgres)', () => {
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
      [userId, 756000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function seedActivities(userId, activities) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    await syncActivitiesToDb(userId, activities);
    require('../../services/strava/activities').invalidate(userId);
  }

  // getActivities() prunes any synced activity newer than 30 days that
  // Strava's "recent window" refetch didn't return (see
  // services/strava/activities.js's `maybeRefreshRecent` — it treats
  // "Strava didn't return it" as "deleted on Strava"), and that refetch
  // always runs on a user's very first getActivities() call. Our stubbed
  // stravaHttp always returns an empty activities page, so seeding
  // activities dated within the last 30 days (as GET /api/analytics/ftp's
  // own window tests need) and then immediately calling the route would
  // have every one of them pruned before ftpAnalysisService ever sees them.
  // Call getActivities() once, before seeding, to record this user's "just
  // refreshed" timestamp (6h throttle) so the recent-window refetch is
  // skipped on every subsequent call in this test.
  async function warmRecentRefreshThrottle(userId) {
    await require('../../services/strava/activities').getActivities(userId);
  }

  function rideFixture(idOffset, overrides = {}) {
    const daysAgo = 5 + idOffset;
    const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      id: 900000 + idOffset,
      name: `Ride ${idOffset}`,
      type: 'Ride',
      start_date: start.toISOString(),
      distance: 30000,
      moving_time: 3600,
      average_heartrate: 150,
      total_elevation_gain: 0,
      average_speed: 30000 / 3600,
      max_speed: 12,
      ...overrides,
    };
  }

  // Heart-rate stream at 1Hz: `belowSec` seconds below threshold, then
  // `aboveSec` seconds at/above it, then `belowSec` seconds below again.
  function streamsFixture({ belowSec = 60, aboveSec = 0, belowHr = 120, aboveHr = 175 } = {}) {
    const hr = [
      ...Array(belowSec).fill(belowHr),
      ...Array(aboveSec).fill(aboveHr),
      ...Array(belowSec).fill(belowHr),
    ];
    return { heartrate: { data: hr }, time: { data: hr.map((_, i) => i) } };
  }

  it('GET /api/activities/:id/ftp-analysis computes and caches an interval, then serves it from cache on a second call', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [rideFixture(1)]);
    streamsByActivity.set(900001, streamsFixture({ aboveSec: 180 })); // 180s >= 120s min -> one interval

    const first = await request(app).get('/api/activities/900001/ftp-analysis').set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);
    expect(first.body.totalIntervals).toBe(1);
    expect(first.body.totalMinutes).toBe(3);
    expect(first.body.fromCache).toBe(false);
    expect(streamsCallCount).toBe(1);

    // Persisted, not just computed in memory.
    const row = await pool.query(
      'SELECT result, kind FROM activity_analysis WHERE user_id = $1 AND strava_id = $2',
      [user.id, 900001]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].kind).toBe('ftp');
    expect(row.rows[0].result.totalIntervals).toBe(1);

    // Second call is served from the cache — no second stream fetch.
    const second = await request(app).get('/api/activities/900001/ftp-analysis').set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.totalIntervals).toBe(1);
    expect(second.body.fromCache).toBe(true);
    expect(streamsCallCount).toBe(1); // unchanged — no second fetch
  }, 15000);

  it('GET /api/activities/:id/ftp-analysis finds no interval when the HR run is too short', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [rideFixture(2)]);
    streamsByActivity.set(900002, streamsFixture({ aboveSec: 30 })); // below the 120s minimum

    const res = await request(app).get('/api/activities/900002/ftp-analysis').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalIntervals).toBe(0);
    expect(res.body.totalMinutes).toBe(0);
  }, 15000);

  it('GET /api/analytics/ftp aggregates across this user\'s rides in the window and only counts activities with an interval as sessions', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);
    await seedActivities(user.id, [
      rideFixture(11),
      rideFixture(12, { average_heartrate: null }), // no HR -> skipped entirely
      rideFixture(13),
    ]);
    streamsByActivity.set(900011, streamsFixture({ aboveSec: 150 })); // 1 interval
    streamsByActivity.set(900013, streamsFixture({ aboveSec: 0 })); // no interval

    const res = await request(app).get('/api/analytics/ftp').query({ days: 28 }).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.highIntensitySessions).toBe(1);
    expect(res.body.totalIntervals).toBe(1);
    expect(res.body.totalMinutes).toBeGreaterThan(0);
    // Ride 12 has no average_heartrate and is skipped before ever touching
    // streams — only rides 11 and 13 should count as analyzed.
    expect(res.body.activitiesAnalyzed).toBe(2);
    expect(streamsCallCount).toBe(2);

    // Results are cached per-activity, so a second call reuses them.
    const second = await request(app).get('/api/analytics/ftp').query({ days: 28 }).set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.highIntensitySessions).toBe(1);
    expect(streamsCallCount).toBe(2); // unchanged — both rides served from cache
  }, 15000);

  it('GET /api/analytics/ftp excludes activities outside the requested window', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);
    await seedActivities(user.id, [rideFixture(21, { start_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() })]);

    const res = await request(app).get('/api/analytics/ftp').query({ days: 28 }).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.activitiesAnalyzed).toBe(0);
    expect(streamsCallCount).toBe(0);
  }, 15000);
});
