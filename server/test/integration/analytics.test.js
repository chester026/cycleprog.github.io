const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/analytics/summary for a user with no Strava link and no manual
// rides — the route must stay a stable 200 (not 500) since
// `stravaActivities.getActivities` throws `StravaNotLinkedError` for a user
// who never connected Strava, and the route already catches that (T-3.2,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.2 "GET /api/analytics/summary for a
// user with 0 activities"). Also exercises the shared VO2max path
// end-to-end against a real Postgres `user_profiles` row.
describe('GET /api/analytics/summary', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('returns 200 {summary: null} for a user with no Strava link and no manual rides', async () => {
    const user = await createUser(pool, app, request);

    const res = await request(app).get('/api/analytics/summary').set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null });
  });

  it('401 without token', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(401);
  });

  // A scenario with real ride history (to exercise `estimateVO2maxFromActivities`
  // end-to-end via this route) would need either a linked Strava account or
  // rows in `rides` — but that table (server/test/fixtures/base-schema.sql,
  // itself a placeholder for the real baseline per T-1.4's manual step) only
  // has `title/location/start`, not the `type/distance/average_speed/
  // start_date` shape `/api/analytics/summary` expects from it, and
  // `getActivities` throws `StravaNotLinkedError` before ever reading
  // `synced_activities` for a user with no Strava tokens. So the non-empty
  // path isn't exercisable here without a live/mocked Strava link; the
  // shared formula itself is fully covered by
  // `packages/shared/src/calc/vo2max.test.ts`.

  describe('with seeded Strava rides', () => {
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

    // getActivities() prunes any synced activity newer than 30 days that
    // Strava's "recent window" refetch didn't return, and that refetch
    // always runs on a user's very first getActivities() call — see
    // ftpAnalysis.test.js for the full explanation. Call getActivities()
    // once, before seeding, so the recent-window refetch is skipped on
    // every subsequent call in this test.
    async function warmRecentRefreshThrottle(userId) {
      await require('../../services/strava/activities').getActivities(userId);
    }

    function rideFixture(idOffset, overrides = {}) {
      const daysAgo = 5 + idOffset;
      const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      return {
        id: 950000 + idOffset,
        name: `Ride ${idOffset}`,
        type: 'Ride',
        start_date: start.toISOString(),
        distance: 40000,
        moving_time: 3600,
        average_heartrate: 150,
        total_elevation_gain: 100,
        average_speed: 40000 / 3600,
        max_speed: 15,
        ...overrides,
      };
    }

    beforeAll(() => {
      const { stravaHttp } = require('../../lib/http');
      stravaHttp.request = async ({ url }) => {
        if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
        throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
      };
    });

    it('?period=all returns a non-null summary covering seeded rides regardless of age', async () => {
      const user = await createUser(pool, app, request);
      await linkStrava(user.id);
      await warmRecentRefreshThrottle(user.id);
      await seedActivities(user.id, [rideFixture(1), rideFixture(2)]);

      const res = await request(app)
        .get('/api/analytics/summary')
        .query({ period: 'all' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeTruthy();
      expect(res.body.summary.totalRides).toBe(2);
    });

    it('?period=4w only counts rides within the current 4-week block', async () => {
      const user = await createUser(pool, app, request);
      await linkStrava(user.id);
      await warmRecentRefreshThrottle(user.id);
      await seedActivities(user.id, [
        rideFixture(1),
        rideFixture(2, { start_date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString() }),
      ]);

      const res = await request(app)
        .get('/api/analytics/summary')
        .query({ period: '4w' })
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeTruthy();
      expect(res.body.summary.totalRides).toBe(1);
    });
  });
});

describe('GET /api/analytics/ftp', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401 without token', async () => {
    const res = await request(app).get('/api/analytics/ftp');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analytics/activity/:id', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  beforeEach(() => {
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  });

  async function linkStrava(userId) {
    await pool.query(
      `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
         strava_expires_at = $3 WHERE id = $1`,
      [userId, 758000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function seedActivities(userId, activities) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    await syncActivitiesToDb(userId, activities);
    require('../../services/strava/activities').invalidate(userId);
  }

  // See the equivalent helper above / in ftpAnalysis.test.js: without this,
  // getActivities()'s recent-window refetch (always run on the first call)
  // prunes activities seeded within the last 30 days.
  async function warmRecentRefreshThrottle(userId) {
    await require('../../services/strava/activities').getActivities(userId);
  }

  it('401 without token', async () => {
    const res = await request(app).get('/api/analytics/activity/123');
    expect(res.status).toBe(401);
  });

  it('returns type + recommendations for a known activity', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await warmRecentRefreshThrottle(user.id);
    await seedActivities(user.id, [
      {
        id: 960001,
        name: 'Morning ride',
        type: 'Ride',
        start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        distance: 70000,
        moving_time: 7200,
        average_heartrate: 150,
        average_speed: 70000 / 7200,
        total_elevation_gain: 200,
      },
    ]);

    const res = await request(app).get('/api/analytics/activity/960001').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('Long'); // distance > 60km
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });

  it('404 for an unknown activity id', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, []);

    const res = await request(app).get('/api/analytics/activity/999999').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ACTIVITY_NOT_FOUND');
  });
});
