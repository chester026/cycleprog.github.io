const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/analytics/power-profile against real Postgres: power-meter rides
// only (device_watts), per-ride best efforts cached in `activity_analysis`
// (kind 'power') so a repeat call never re-fetches Strava streams. Strava is
// stubbed the same way as ftpAnalysis.test.js (seeded synced_activities +
// patched stravaHttp).
describe('power profile (power-meter rides only, real Postgres)', () => {
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
      [userId, 757000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  // Warm the 6h "recent refresh" throttle first, otherwise getActivities()
  // prunes seeded rides newer than 30 days (see ftpAnalysis.test.js).
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
      distance: 40000,
      moving_time: 3600,
      average_watts: 150,
      device_watts: true,
      total_elevation_gain: 0,
      average_speed: 10,
      max_speed: 12,
      ...overrides,
    };
  }

  // 10 min at 100 W, 20 min at 280 W, 30 min at 120 W, 1 Hz.
  const hardRideStreams = () => {
    const watts = [...Array(600).fill(100), ...Array(1200).fill(280), ...Array(1800).fill(120)];
    return { watts: { data: watts }, time: { data: watts.map((_, i) => i) } };
  };

  it('computes best efforts, FTP, W/kg and zones from power-meter rides, ignores estimated/old rides, and caches per ride', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await pool.query('INSERT INTO user_profiles (user_id, weight) VALUES ($1, 70)', [user.id]);
    await seedActivities(user.id, [
      ride(910001, 7),
      ride(910002, 9, { device_watts: false, average_watts: 250 }), // estimated by the platform, not a meter
      ride(910003, 200), // outside the 12-week window
      ride(910004, 3, { average_watts: undefined, device_watts: undefined }), // no power at all
    ]);
    streamsByActivity.set(910001, hardRideStreams());

    const first = await request(app).get('/api/analytics/power-profile').set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);
    expect(first.body.weeks).toBe(12);
    expect(first.body.ridesWithPower).toBe(1);
    expect(first.body.ridesAnalyzed).toBe(1);
    expect(first.body.bestEfforts['5'].watts).toBe(280);
    expect(first.body.bestEfforts['1200']).toMatchObject({ watts: 280, activityId: 910001 });
    // (10 min x 100 W + 20 min x 280 W + 30 min x 120 W) / 60 min = 170 W
    expect(first.body.bestEfforts['3600'].watts).toBe(170);
    expect(first.body.ftp).toMatchObject({ watts: 266, method: 'ftp20', fromActivityId: 910001 });
    expect(first.body.wPerKg).toBe(3.8);
    expect(first.body.zones).toHaveLength(7);
    expect(first.body.zones[3]).toEqual({ zone: 4, name: 'Threshold', minW: 240, maxW: 279 });
    expect(first.body.zones[6].maxW).toBeNull();
    expect(first.body.note).toBeNull();
    expect(streamsCallCount).toBe(1);

    const cached = await pool.query(
      `SELECT result FROM activity_analysis WHERE user_id = $1 AND strava_id = 910001 AND kind = 'power'`,
      [user.id]
    );
    expect(cached.rows[0].result.efforts['1200']).toBe(280);

    const second = await request(app).get('/api/analytics/power-profile?weeks=12').set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.ftp.watts).toBe(266);
    expect(streamsCallCount).toBe(1); // served from activity_analysis

    const badWeeks = await request(app).get('/api/analytics/power-profile?weeks=0').set('Authorization', `Bearer ${user.token}`);
    expect(badWeeks.status).toBe(400);
  });

  it('returns no FTP and an explanatory note for a rider without power-meter rides', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [ride(910101, 5, { device_watts: false, average_watts: 158 })]);

    const res = await request(app).get('/api/analytics/power-profile').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ridesWithPower: 0, ridesAnalyzed: 0, bestEfforts: {}, ftp: null, wPerKg: null, zones: [] });
    expect(res.body.note).toMatch(/No power-meter rides in the last 12 weeks/);
    expect(streamsCallCount).toBe(0);
  });
});
