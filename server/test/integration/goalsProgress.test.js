const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// GET /api/goals / GET /api/meta-goals server-computed progress (T-3.4,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.4, docs/audit/layers/04-cross-layer.md
// §4.2). Per "RULE: SQL changes need real-PG integration tests" — this
// covers the new write-back in GET /api/goals (the only writer of
// goals.current_value now), the client-current_value guard on
// PUT /api/goals/:id, GET /api/meta-goals' inline `sub_goals`, and the
// admin-only gate on POST /api/goals/update-current.
//
// Activities are seeded directly into `synced_activities` (like
// skills.test.js/stravaSync.test.js do) rather than via a real Strava link —
// the test user is given fake-but-valid Strava tokens (so `getActivities`
// doesn't throw StravaNotLinkedError before ever reading the DB), and this
// file monkey-patches the shared `stravaHttp` axios instance so the one "top
// up from Strava" call `getActivities` makes returns an empty page instead
// of hitting the network. Seeded activities are dated >30 days ago (outside
// `syncIncremental`'s "recent 30 days" prune window).
describe('goals progress (server-computed, real Postgres)', () => {
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
      [userId, 655000 + userId, Math.floor(Date.now() / 1000) + 3600]
    );
  }

  async function seedActivities(userId, activities) {
    const { syncActivitiesToDb } = require('../../services/strava/activities');
    await syncActivitiesToDb(userId, activities);
    require('../../services/strava/activities').invalidate(userId);
  }

  it('GET /api/goals computes and persists current_value for an activity-source (legacy distance) goal', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [
      { id: 800001, name: 'Ride A', type: 'Ride', start_date: new Date(Date.now() - 40 * 86400000).toISOString(), distance: 30000, moving_time: 3600, total_elevation_gain: 100, average_speed: 8 },
      { id: 800002, name: 'Ride B', type: 'Ride', start_date: new Date(Date.now() - 60 * 86400000).toISOString(), distance: 20000, moving_time: 2400, total_elevation_gain: 50, average_speed: 8 },
    ]);

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Ride 100km', target_value: 100, unit: 'km', goal_type: 'distance', period: 'all' });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    const getRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);
    expect(getRes.status).toBe(200);
    const goal = getRes.body.find((g) => g.id === goalId);
    expect(goal).toBeTruthy();
    // (30000 + 20000) / 1000 = 50 km
    expect(Number(goal.current_value)).toBe(50);
    expect(goal.percent).toBe(50);

    // Persisted back to the row — this route is the only writer now.
    const row = await pool.query('SELECT current_value FROM goals WHERE id = $1', [goalId]);
    expect(Number(row.rows[0].current_value)).toBe(50);
  });

  it('PUT /api/goals/:id ignores a client-supplied current_value for a computed (non-manual) goal', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [
      { id: 800101, name: 'Ride', type: 'Ride', start_date: new Date(Date.now() - 40 * 86400000).toISOString(), distance: 10000, moving_time: 1800, total_elevation_gain: 20, average_speed: 6 },
    ]);

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Ride 50km', target_value: 50, unit: 'km', goal_type: 'distance', period: 'all' });
    const goalId = createRes.body.id;

    // Establish the server-computed value first (10 km).
    await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);

    const putRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ current_value: 999 });
    expect(putRes.status).toBe(200);
    // The route ignores current_value for a computed goal — it must not
    // echo back the client's bogus 999.
    expect(Number(putRes.body.current_value)).not.toBe(999);

    const getRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);
    const goal = getRes.body.find((g) => g.id === goalId);
    expect(Number(goal.current_value)).toBe(10);
  });

  it('PUT /api/goals/:id DOES accept a client-supplied current_value for a manual ("custom") goal', async () => {
    const user = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'My custom goal', target_value: 10, unit: 'things', goal_type: 'custom', current_value: 0 });
    const goalId = createRes.body.id;

    const putRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ current_value: 7 });
    expect(putRes.status).toBe(200);
    expect(Number(putRes.body.current_value)).toBe(7);

    // GET /api/goals must not reset it back to 0 (the T-3.4 manual-goal fix).
    const getRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);
    const goal = getRes.body.find((g) => g.id === goalId);
    expect(Number(goal.current_value)).toBe(7);
  });

  it('GET /api/meta-goals returns sub_goals with server-computed progress inline (no per-row GET /api/goals needed)', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [
      { id: 800201, name: 'Ride', type: 'Ride', start_date: new Date(Date.now() - 35 * 86400000).toISOString(), distance: 40000, moving_time: 3600, total_elevation_gain: 100, average_speed: 8 },
    ]);

    const metaRes = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Base fitness', 'active') RETURNING id`,
      [user.id]
    );
    const metaGoalId = metaRes.rows[0].id;
    const goalRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Ride 40km', target_value: 40, unit: 'km', goal_type: 'distance', period: 'all', meta_goal_id: metaGoalId });
    expect(goalRes.status).toBe(200);

    const listRes = await request(app).get('/api/meta-goals').set('Authorization', `Bearer ${user.token}`);
    expect(listRes.status).toBe(200);
    const metaGoal = listRes.body.find((mg) => mg.id === metaGoalId);
    expect(metaGoal).toBeTruthy();
    expect(Array.isArray(metaGoal.sub_goals)).toBe(true);
    expect(metaGoal.sub_goals).toHaveLength(1);
    expect(Number(metaGoal.sub_goals[0].current_value)).toBe(40);
    expect(metaGoal.sub_goals[0].percent).toBe(100);
  });

  it('POST /api/goals/update-current is admin-only — a regular user gets 403', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/goals/update-current')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('POST /api/goals/update-current works for an admin', async () => {
    const admin = await createUser(pool, app, request, { isAdmin: true });
    await linkStrava(admin.id);
    await seedActivities(admin.id, [
      { id: 800301, name: 'Ride', type: 'Ride', start_date: new Date(Date.now() - 35 * 86400000).toISOString(), distance: 20000, moving_time: 2400, total_elevation_gain: 50, average_speed: 8 },
    ]);
    const res = await request(app)
      .post('/api/goals/update-current')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('recovery goal counts only rides under 20 km/h (correct ×3.6 conversion)', async () => {
    const user = await createUser(pool, app, request);
    await linkStrava(user.id);
    await seedActivities(user.id, [
      // 4 m/s = 14.4 km/h -> recovery
      { id: 800401, name: 'Slow spin', type: 'Ride', start_date: new Date(Date.now() - 35 * 86400000).toISOString(), distance: 15000, moving_time: 3750, total_elevation_gain: 20, average_speed: 4 },
      // 8 m/s = 28.8 km/h -> NOT recovery
      { id: 800402, name: 'Fast ride', type: 'Ride', start_date: new Date(Date.now() - 36 * 86400000).toISOString(), distance: 30000, moving_time: 3750, total_elevation_gain: 20, average_speed: 8 },
    ]);

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Recovery rides', target_value: 5, unit: 'rides', goal_type: 'recovery', period: 'all' });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    const getRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);
    const goal = getRes.body.find((g) => g.id === goalId);
    expect(Number(goal.current_value)).toBe(1);
  });
});
