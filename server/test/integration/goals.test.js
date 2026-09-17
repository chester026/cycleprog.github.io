const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// IDOR coverage for /api/goals + /api/meta-goals (T-1.7,
// docs/audit/00-AUDIT-AND-PLAN.md — "goals IDOR почти везде закрыт AND
// user_id = $N", this suite proves it end to end).
describe('goals IDOR', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it("B can't see, edit, or attach to A's goal/meta-goal", async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const metaGoalResult = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'A meta goal', 'active') RETURNING id`,
      [userA.id]
    );
    const metaGoalId = metaGoalResult.rows[0].id;

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: "A's goal", target_value: 100, unit: 'km', goal_type: 'distance', meta_goal_id: metaGoalId });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    // B doesn't see A's goal in their own list.
    const listRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${userB.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((g) => g.id === goalId)).toBeUndefined();

    // B can't update A's goal — route returns 404 for a goal not owned by
    // the caller (server.js's PUT /api/goals/:id scopes its SELECT by
    // `AND user_id = $2`).
    const putRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'hijacked' });
    expect(putRes.status).toBe(404);
    expect(putRes.body.code).toBe('GOAL_NOT_FOUND');

    const unchanged = await pool.query('SELECT title FROM goals WHERE id = $1', [goalId]);
    expect(unchanged.rows[0].title).toBe("A's goal");

    // B can't attach a new goal to A's meta-goal.
    const forbiddenRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: "B's goal", target_value: 50, unit: 'km', goal_type: 'distance', meta_goal_id: metaGoalId });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.code).toBe('META_GOAL_NOT_FOUND');
  });

  it("B can't see, edit, or delete A's meta-goal", async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const metaGoalResult = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'A meta goal', 'active') RETURNING id`,
      [userA.id]
    );
    const metaGoalId = metaGoalResult.rows[0].id;

    // B doesn't see A's meta-goal in their own list.
    const listRes = await request(app).get('/api/meta-goals').set('Authorization', `Bearer ${userB.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((mg) => mg.id === metaGoalId)).toBeUndefined();

    // B gets a 404 reading it directly.
    const getRes = await request(app).get(`/api/meta-goals/${metaGoalId}`).set('Authorization', `Bearer ${userB.token}`);
    expect(getRes.status).toBe(404);
    expect(getRes.body.code).toBe('META_GOAL_NOT_FOUND');

    // B can't update it.
    const putRes = await request(app)
      .put(`/api/meta-goals/${metaGoalId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ title: 'hijacked' });
    expect(putRes.status).toBe(404);
    expect(putRes.body.code).toBe('META_GOAL_NOT_FOUND');

    // B can't delete it.
    const delRes = await request(app).delete(`/api/meta-goals/${metaGoalId}`).set('Authorization', `Bearer ${userB.token}`);
    expect(delRes.status).toBe(404);
    expect(delRes.body.code).toBe('META_GOAL_NOT_FOUND');

    const stillThere = await pool.query('SELECT title FROM meta_goals WHERE id = $1', [metaGoalId]);
    expect(stillThere.rows[0].title).toBe('A meta goal');
  });
});

// 401 guards + CRUD round-trips for the routes moved to routes/goals.js and
// routes/metaGoals.js (T-4.1).
describe('goals + meta-goals routes', () => {
  let app, pool, user;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    // Shared across most tests below (each keeps to its own goal/meta-goal
    // id) — authLimiter (10 logins/15min/IP) means this file can't afford a
    // fresh createUser() per test.
    user = await createUser(pool, app, request);
  }, 30000);

  describe('401 without token', () => {
    const cases = [
      ['get', '/api/goals'],
      ['post', '/api/goals'],
      ['put', '/api/goals/1'],
      ['post', '/api/goals/recalc-vo2max/1'],
      ['delete', '/api/goals/1'],
      ['post', '/api/goals/update-current'],
      ['get', '/api/goals/1/recommendations'],
      ['get', '/api/meta-goals'],
      ['get', '/api/meta-goals/1'],
      ['post', '/api/meta-goals'],
      ['post', '/api/meta-goals/ai-generate'],
      ['put', '/api/meta-goals/1'],
      ['delete', '/api/meta-goals/1'],
    ];

    for (const [method, path] of cases) {
      it(`${method.toUpperCase()} ${path}`, async () => {
        const res = await request(app)[method](path);
        expect(res.status).toBe(401);
      });
    }
  });

  it('goals CRUD round-trip', async () => {
    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Custom goal', target_value: 10, unit: 'things', goal_type: 'custom', current_value: 0 });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    const listRes = await request(app).get('/api/goals').set('Authorization', `Bearer ${user.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((g) => g.id === goalId)).toBeTruthy();

    const putRes = await request(app)
      .put(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Renamed goal' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Renamed goal');

    const delRes = await request(app).delete(`/api/goals/${goalId}`).set('Authorization', `Bearer ${user.token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const afterDelete = await request(app)
      .delete(`/api/goals/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(afterDelete.status).toBe(404);
    expect(afterDelete.body.code).toBe('GOAL_NOT_FOUND');
  });

  it('meta-goals CRUD round-trip', async () => {
    const createRes = await request(app)
      .post('/api/meta-goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'My meta goal', description: 'desc' });
    expect(createRes.status).toBe(200);
    const metaGoalId = createRes.body.id;

    const listRes = await request(app).get('/api/meta-goals').set('Authorization', `Bearer ${user.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((mg) => mg.id === metaGoalId)).toBeTruthy();

    const getRes = await request(app).get(`/api/meta-goals/${metaGoalId}`).set('Authorization', `Bearer ${user.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.metaGoal.id).toBe(metaGoalId);
    expect(getRes.body.subGoals).toEqual([]);

    const putRes = await request(app)
      .put(`/api/meta-goals/${metaGoalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Renamed meta goal' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.title).toBe('Renamed meta goal');

    const delRes = await request(app).delete(`/api/meta-goals/${metaGoalId}`).set('Authorization', `Bearer ${user.token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const afterDelete = await request(app)
      .delete(`/api/meta-goals/${metaGoalId}`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(afterDelete.status).toBe(404);
    expect(afterDelete.body.code).toBe('META_GOAL_NOT_FOUND');
  });

  it('POST /api/meta-goals requires a title', async () => {
    const res = await request(app)
      .post('/api/meta-goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/meta-goals/ai-generate requires a goal description', async () => {
    const res = await request(app)
      .post('/api/meta-goals/ai-generate')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/goals/recalc-vo2max/:id — 400 for a non-FTP goal, 404 for a missing one', async () => {
    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Ride 100km', target_value: 100, unit: 'km', goal_type: 'distance' });
    const goalId = createRes.body.id;

    const badTypeRes = await request(app)
      .post(`/api/goals/recalc-vo2max/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(badTypeRes.status).toBe(400);
    expect(badTypeRes.body.code).toBe('BAD_REQUEST');

    const missingRes = await request(app)
      .post('/api/goals/recalc-vo2max/999999')
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.code).toBe('GOAL_NOT_FOUND');
  });

  it('POST /api/goals/recalc-vo2max/:id recomputes VO2max for an FTP goal (mocked Strava)', async () => {
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };

    await pool.query(
      `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
         strava_expires_at = $3 WHERE id = $1`,
      [user.id, 656000 + user.id, Math.floor(Date.now() / 1000) + 3600]
    );
    const { syncActivitiesToDb, invalidate } = require('../../services/strava/activities');
    // Dated outside syncIncremental's "recent 30 days" prune window (see
    // goalsProgress.test.js), and the recalc call below asks for the '3m'
    // period so it's still inside that filter window.
    await syncActivitiesToDb(user.id, [
      { id: 900001, name: 'Ride', type: 'Ride', start_date: new Date(Date.now() - 35 * 86400000).toISOString(), distance: 25000, moving_time: 3600, total_elevation_gain: 100, average_speed: 7, average_heartrate: 150, max_heartrate: 175 },
    ]);
    invalidate(user.id);

    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'FTP goal', target_value: 0, unit: 'W', goal_type: 'ftp_vo2max', period: '3m' });
    expect(createRes.status).toBe(200);
    const goalId = createRes.body.id;

    const res = await request(app)
      .post(`/api/goals/recalc-vo2max/${goalId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ period: '3m' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.goal_id).toBe(String(goalId));
  });

  it('GET /api/goals/:goalId/recommendations — happy path, 404 for missing, 400 for non-numeric id', async () => {
    const createRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Distance goal', target_value: 100, unit: 'km', goal_type: 'distance' });
    const goalId = createRes.body.id;

    const res = await request(app)
      .get(`/api/goals/${goalId}/recommendations`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.goal.id).toBe(goalId);

    const missingRes = await request(app)
      .get('/api/goals/999999/recommendations')
      .set('Authorization', `Bearer ${user.token}`);
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.code).toBe('GOAL_NOT_FOUND');

    const badIdRes = await request(app)
      .get('/api/goals/not-a-number/recommendations')
      .set('Authorization', `Bearer ${user.token}`);
    expect(badIdRes.status).toBe(400);
    expect(badIdRes.body.code).toBe('VALIDATION_ERROR');
  });
});
