const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/activities/:id/power-breakdown (docs/plans/ride-power-insights.md)
// end to end on real Postgres: streams → activity_streams cache → ride_power
// breakdown + per-ride efforts (activity_analysis) → 12-week comparison.
// Strava is stubbed at stravaHttp, same as powerProfile.test.js.
describe('ride power insights (real Postgres)', () => {
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
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      const match = String(url).match(/\/activities\/(\d+)\/streams/);
      if (match) {
        streamsCallCount += 1;
        const fixture = streamsByActivity.get(Number(match[1]));
        if (!fixture) throw new Error(`no streams fixture registered for activity ${match[1]}`);
        return { data: fixture, headers: {} };
      }
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
    const stravaActivities = require('../../services/strava/activities');
    await stravaActivities.getActivities(userId);
    await stravaActivities.syncActivitiesToDb(userId, activities);
    await stravaActivities.invalidate(userId);
  }

  function ride(id, daysAgo, overrides = {}) {
    return {
      id,
      name: `Ride ${id}`,
      type: 'Ride',
      start_date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      distance: 36000,
      moving_time: 3600,
      average_watts: 150,
      device_watts: true,
      total_elevation_gain: 0,
      average_speed: 10,
      max_speed: 12,
      ...overrides,
    };
  }

  // One hour at `w` watts, 1 Hz, flat, 10 m/s.
  const steady = (w) => {
    const watts = Array(3600).fill(w);
    return {
      watts: { data: watts },
      time: { data: watts.map((_, i) => i) },
      velocity_smooth: { data: Array(3600).fill(10) },
      altitude: { data: Array(3600).fill(50) },
    };
  };

  it('returns breakdown + insights ranked against the window, caching everything', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [ride(920001, 2), ride(920002, 20), ride(920003, 40)]);
    streamsByActivity.set(920001, steady(220));
    streamsByActivity.set(920002, steady(250));
    streamsByActivity.set(920003, steady(200));

    const res = await request(app).get('/api/activities/920001/power-breakdown').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.breakdown).toMatchObject({ activity_id: 920001, source: 'meter', avg_w: 220, np_w: 220 });
    // FTP = 95 % of the best 20 min in the window (250 W) = 238 → IF 0.92 → threshold
    expect(res.body.breakdown.ftp_w).toBe(238);
    expect(res.body.insights).toMatchObject({ intensity: 'threshold', weeks: 12, partial: false });
    // 238 either way (ride 920002's 250 W sets it) → this ride did not move it; no weight on file
    expect(res.body.insights.ftp).toEqual({ watts: 238, w_per_kg: null, delta_w: 0 });
    const row1200 = res.body.insights.efforts.find((e) => e.seconds === 1200);
    expect(row1200).toMatchObject({ watts: 220, best_watts: 250, best_activity_id: 920002, rank: 2, total: 3, pct_of_best: 88, gap_w: 30, is_pr: false });
    expect(res.body.insights.highlight).toEqual({ seconds: 3600, rank: 2, total: 3 });
    // rank 2 at every duration → the highlight is the longest (1 h); two previous rides are too few for an average
    expect(res.body.insights.recent.default_seconds).toBe(3600);
    expect(res.body.insights.recent.options.map((o) => o.seconds)).toEqual([1200, 3600]);
    const hour = res.body.insights.recent.options[1];
    expect(hour).toMatchObject({ seconds: 3600, reason: 'highlight', ride_w: 220, rank: 2, total: 3, avg_prev_w: null });
    expect(hour.rides.map((r) => r.watts)).toEqual([200, 250]);
    expect(res.body.insights.pacing).toMatchObject({ kind: 'even' });
    expect(res.body.breakdown.segments).toHaveLength(1);
    expect(streamsCallCount).toBe(3);

    // Second open: nothing goes to Strava.
    const again = await request(app).get('/api/activities/920001/power-breakdown').set('Authorization', `Bearer ${user.token}`);
    expect(again.status).toBe(200);
    expect(again.body.insights.efforts.find((e) => e.seconds === 1200).rank).toBe(2);
    expect(streamsCallCount).toBe(3);

    const cached = await pool.query("SELECT kind FROM activity_analysis WHERE user_id = $1 AND strava_id = 920001 ORDER BY kind", [user.id]);
    expect(cached.rows.map((r) => r.kind)).toEqual(['power', 'ride_power']);
  });

  it('a ride without a power meter gets the breakdown with source none and no insights', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [ride(920010, 2, { device_watts: false })]);
    const s = steady(0);
    delete s.watts;
    streamsByActivity.set(920010, s);

    const res = await request(app).get('/api/activities/920010/power-breakdown').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.breakdown.source).toBe('none');
    expect(res.body.breakdown.note).toMatch(/No power-meter data/);
    expect(res.body.insights).toBeNull();
  });

  it('without a Strava link the breakdown degrades to a note instead of an error', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app).get('/api/activities/920020/power-breakdown').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.breakdown.note).toMatch(/not linked/);
    expect(res.body.insights).toBeNull();
  });
});
