const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Raw streams cache (docs/plans/coach-ride-power-breakdown.md §1, migration
// `1758000000017_activity-streams.sql`) against real Postgres: one Strava
// GET per ride, every later getStreams() call served from `activity_streams`;
// `force` re-fetches; retention deletes by `fetched_at`; the row follows the
// user on delete (FK cascade). Strava is stubbed at the `stravaHttp` level,
// same as ftpAnalysis.test.js.
describe('activity_streams cache (real Postgres)', () => {
  let app, pool;
  let streamsCallCount;
  let fixture;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  beforeEach(() => {
    streamsCallCount = 0;
    fixture = {
      watts: { data: [100, 200, 300] },
      time: { data: [0, 1, 2] },
      altitude: { data: [10, 11, 12] },
    };
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/activities/') && String(url).includes('/streams')) {
        streamsCallCount += 1;
        return { data: fixture, headers: {} };
      }
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
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

  it('fetches from Strava once, then serves the cached row (round-trips the gzip blob exactly)', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    const strava = require('../../services/strava/activities');

    const first = await strava.getStreams(user.id, 910001);
    expect(first).toEqual(fixture);
    expect(streamsCallCount).toBe(1);

    const row = await pool.query('SELECT keys, fetched_at FROM activity_streams WHERE user_id = $1 AND strava_id = $2', [user.id, 910001]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].keys.sort()).toEqual(['altitude', 'time', 'watts']);

    fixture = { watts: { data: [999] } }; // Strava "changed" — must not be seen through the cache
    const second = await strava.getStreams(user.id, '910001'); // string id, as route params arrive
    expect(second).toEqual(first);
    expect(streamsCallCount).toBe(1);
  });

  it('force re-fetches and overwrites the cached row', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    const strava = require('../../services/strava/activities');

    await strava.getStreams(user.id, 910002);
    fixture = { watts: { data: [999] }, time: { data: [0] } };
    const forced = await strava.getStreams(user.id, 910002, { force: true });
    expect(forced).toEqual(fixture);
    expect(streamsCallCount).toBe(2);
    expect(await strava.getStreams(user.id, 910002)).toEqual(fixture);
    expect(streamsCallCount).toBe(2);
  });

  it('GET /api/activities/:id/streams and the ftp-analysis share the one cached fetch', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);

    const res1 = await request(app).get('/api/activities/910003/streams').set('Authorization', `Bearer ${user.token}`);
    expect(res1.status).toBe(200);
    expect(res1.body.watts.data).toEqual([100, 200, 300]);
    const res2 = await request(app).get('/api/activities/910003/streams').set('Authorization', `Bearer ${user.token}`);
    expect(res2.status).toBe(200);
    expect(streamsCallCount).toBe(1);
  });

  it('deleteOlderThan removes only rows past the retention window', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    const strava = require('../../services/strava/activities');
    const repo = require('../../repositories/activityStreams');

    await strava.getStreams(user.id, 910004);
    await strava.getStreams(user.id, 910005);
    await pool.query(
      "UPDATE activity_streams SET fetched_at = NOW() - INTERVAL '40 days' WHERE user_id = $1 AND strava_id = 910004",
      [user.id]
    );

    const removed = await repo.deleteOlderThan(30);
    expect(removed).toBe(1);
    const left = await pool.query('SELECT strava_id FROM activity_streams WHERE user_id = $1', [user.id]);
    expect(left.rows.map((r) => Number(r.strava_id))).toEqual([910005]);

    // Expired ride opened again → one more Strava GET, row is back.
    await strava.getStreams(user.id, 910004);
    expect(streamsCallCount).toBe(3);
  });

  it('cascades with the user', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await require('../../services/strava/activities').getStreams(user.id, 910006);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const left = await pool.query('SELECT 1 FROM activity_streams WHERE user_id = $1', [user.id]);
    expect(left.rows).toHaveLength(0);
  });
});
