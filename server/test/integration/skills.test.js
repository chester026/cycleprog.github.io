const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/skills (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md T-3.3): real-PG
// coverage of the server-computed skills radar + idempotent snapshotting +
// analytics_snapshots refresh + the admin-only fallback writes. Per the
// "RULE: SQL changes need real-PG integration tests" rule (the new
// `idx_skills_history_user_last_activity` unique index +
// services/skills.js's upsert logic).
//
// Activities are seeded directly into `synced_activities` (like
// stravaSync.test.js does) rather than via a real Strava link — the test
// user IS given fake-but-valid Strava tokens (so `getActivities` doesn't
// throw StravaNotLinkedError before ever reading the DB), and this file
// monkey-patches the shared `stravaHttp` axios instance so the one
// "top up from Strava" call `getActivities` still makes returns an empty
// page instead of hitting the network — same technique auth.test.js uses
// for Brevo. Seeded activities are dated >30 days ago (outside
// `syncIncremental`'s "recent 30 days" prune window) but within the skills'
// 90-day window, so the mocked empty Strava response never causes the
// prune step to delete them.
describe('GET /api/skills', () => {
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

  async function linkStrava(userId) {
    await pool.query(
      `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
         strava_expires_at = $3 WHERE id = $1`,
      [userId, 555000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function seedActivities(userId, count, { daysAgoStart = 40, idOffset = 0 } = {}) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    const activities = Array.from({ length: count }, (_, i) => {
      const daysAgo = daysAgoStart + i; // all >30d ago (outside the recent-refresh prune window)
      const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      return {
        id: 700000 + userId * 1000 + idOffset + i,
        name: `Ride ${i}`,
        type: 'Ride',
        start_date: start.toISOString(),
        distance: 45000,
        moving_time: 5400,
        elapsed_time: 5500,
        total_elevation_gain: 300,
        average_speed: 8.5,
        max_speed: 13,
        average_heartrate: 145,
        weighted_average_watts: 150,
      };
    });
    await syncActivitiesToDb(userId, activities);
    // getActivities() caches in-memory (2h TTL) — a real sync always goes
    // through that same module so it naturally invalidates itself, but this
    // test writes to synced_activities directly, so it must invalidate by
    // hand for the next GET /api/skills to see the new row.
    require('../../services/strava/activities').invalidate(userId);
    return activities;
  }

  it('computes 6 in-range scales, creates one skills_history row, and an analytics_snapshots row', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, 25);

    const res = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.skills).toBeTruthy();
    for (const key of ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency']) {
      expect(res.body.skills[key]).toBeGreaterThanOrEqual(0);
      expect(res.body.skills[key]).toBeLessThanOrEqual(100);
    }
    expect(res.body.riderProfile.profile).toBeTruthy();
    expect(res.body.previous).toBeNull(); // first snapshot ever for this user

    const historyRows = await pool.query('SELECT * FROM skills_history WHERE user_id = $1', [user.id]);
    expect(historyRows.rows).toHaveLength(1);
    expect(String(historyRows.rows[0].last_activity_id)).toBe(String(res.body.lastActivityId));

    const snapshotRows = await pool.query('SELECT * FROM analytics_snapshots WHERE user_id = $1', [user.id]);
    expect(snapshotRows.rows).toHaveLength(1);
    expect(Number(snapshotRows.rows[0].activities_count)).toBe(25);
  }, 15000);

  // The snapshot describes current form, so it aggregates the 50 most recent
  // rides — the same sample the Analysis screen shows — rather than the
  // rider's whole history (services/analyticsSnapshot.js).
  it('aggregates at most the 50 most recent rides', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, 60);

    const res = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);

    const snapshotRows = await pool.query('SELECT * FROM analytics_snapshots WHERE user_id = $1', [user.id]);
    expect(snapshotRows.rows).toHaveLength(1);
    expect(Number(snapshotRows.rows[0].activities_count)).toBe(50);
  }, 20000);

  it('a second GET with no new activity does not create another skills_history row', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, 10);

    const first = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);

    const second = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.lastActivityId).toBe(first.body.lastActivityId);

    const historyRows = await pool.query('SELECT * FROM skills_history WHERE user_id = $1', [user.id]);
    expect(historyRows.rows).toHaveLength(1);
  }, 15000);

  it('a newer activity produces a new snapshot with previous + trend populated', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, 10, { daysAgoStart: 60 });

    const first = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);
    expect(first.body.previous).toBeNull();

    // A newer (but still >30d ago, so the prune step leaves it alone) ride.
    await seedActivities(user.id, 1, { daysAgoStart: 31, idOffset: 500 });

    const second = await request(app).get('/api/skills').set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.lastActivityId).not.toBe(first.body.lastActivityId);
    expect(second.body.previous).toBeTruthy();
    expect(String(second.body.previous.last_activity_id)).toBe(String(first.body.lastActivityId));
    expect(second.body.trend).toBeTruthy();
    for (const key of ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency']) {
      expect(typeof second.body.trend[key]).toBe('number');
    }

    const historyRows = await pool.query(
      'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date ASC',
      [user.id]
    );
    expect(historyRows.rows).toHaveLength(2);
  }, 15000);

  it('POST /api/skills-history as a non-admin is forbidden', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/skills-history')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ climbing: 10, sprint: 10, endurance: 10, tempo: 10, power: 10, consistency: 10 });
    expect(res.status).toBe(403);
  });

  it('POST /api/analytics-snapshot as a non-admin is forbidden', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/analytics-snapshot')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ lastActivityId: 1 });
    expect(res.status).toBe(403);
  });

  it('DELETE /api/skills-history/cleanup-month as a non-admin is forbidden', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .delete('/api/skills-history/cleanup-month')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);
  });
});

describe('scripts/recompute-skills-history', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  }, 30000);

  it('--dry-run reports diffs without writing, and a real run updates rows consistently', async () => {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    const { recomputeUser } = require('../../scripts/recompute-skills-history');
    const { createUser } = require('./helpers');

    const user = await createUser(pool, app, request);
    await pool.query(
      `UPDATE users SET strava_access_token = 'x', strava_refresh_token = 'y', strava_expires_at = $2 WHERE id = $1`,
      [user.id, Math.floor(Date.now() / 1000) + 3600]
    );

    const activities = Array.from({ length: 15 }, (_, i) => {
      const start = new Date(Date.now() - (40 + i) * 24 * 60 * 60 * 1000);
      return {
        id: 900000 + i,
        name: `Ride ${i}`,
        type: 'Ride',
        start_date: start.toISOString(),
        distance: 40000,
        moving_time: 5000,
        elapsed_time: 5100,
        total_elevation_gain: 200,
        average_speed: 8,
        max_speed: 12,
        average_heartrate: 140,
      };
    });
    await syncActivitiesToDb(user.id, activities);

    // Seed a stale skills_history row (as if written by an old client
    // formula) — the thing recompute is meant to fix.
    const staleRow = await pool.query(
      `INSERT INTO skills_history (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
       VALUES ($1, NOW(), 1, 1, 1, 1, 1, 1, $2) RETURNING *`,
      [user.id, activities[0].id]
    );
    const rowId = staleRow.rows[0].id;

    // --dry-run must not write anything.
    const dryRunResult = await recomputeUser(user.id, { dryRun: true });
    expect(dryRunResult.rows).toBe(1);
    expect(dryRunResult.changed).toBe(1); // the stale row's [1,1,1,1,1,1] differ from the real formula

    const afterDryRun = await pool.query('SELECT * FROM skills_history WHERE id = $1', [rowId]);
    expect(Number(afterDryRun.rows[0].climbing)).toBe(1); // unchanged

    // Real run writes the recomputed values.
    const realResult = await recomputeUser(user.id, { dryRun: false });
    expect(realResult.changed).toBe(1);

    const afterReal = await pool.query('SELECT * FROM skills_history WHERE id = $1', [rowId]);
    expect(Number(afterReal.rows[0].climbing)).not.toBe(1);

    // Running it again on the now-consistent row changes nothing further.
    const secondRun = await recomputeUser(user.id, { dryRun: false });
    expect(secondRun.changed).toBe(0);
  }, 20000);
});
