const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Real-PG coverage for the training-plan domain (T-4.1): /api/training-plan,
// /api/training-types(/:type), /api/training-plan/stats, and
// /api/training-plan/custom(/:dayKey) — extracted out of server.js into
// routes/training.js + services/training.js + repositories/training.js.
describe('training-plan routes', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  describe('401 without a token', () => {
    it.each([
      ['get', '/api/training-plan'],
      ['get', '/api/training-types'],
      ['get', '/api/training-types/endurance'],
      ['get', '/api/training-plan/stats'],
      ['post', '/api/training-plan/custom'],
      ['delete', '/api/training-plan/custom/monday'],
    ])('%s %s', async (method, url) => {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    });
  });

  it('GET /api/training-plan generates a fallback plan for a user with no goals, and reuses it on a second call', async () => {
    const user = await createUser(pool, app, request);

    const first = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${user.token}`);
    expect(first.status).toBe(200);
    expect(first.body.isFallbackPlan).toBe(true);
    expect(first.body.plan).toBeTruthy();
    expect(first.body.weekStartDate).toBeTruthy();
    expect(first.body.customPlan).toEqual({});

    // Regenerating with no goal/profile change reuses the cached
    // generated_weekly_plans row instead of writing a second one.
    const second = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${user.token}`);
    expect(second.status).toBe(200);
    expect(second.body.weekStartDate).toBe(first.body.weekStartDate);

    const planRows = await pool.query(
      'SELECT * FROM generated_weekly_plans WHERE user_id = $1',
      [user.id]
    );
    expect(planRows.rows).toHaveLength(1);
  });

  it('GET /api/training-types lists the catalog and GET /api/training-types/:type returns one entry', async () => {
    const user = await createUser(pool, app, request);

    const listRes = await request(app)
      .get('/api/training-types')
      .set('Authorization', `Bearer ${user.token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
    expect(listRes.body[0]).toHaveProperty('key');

    const key = listRes.body[0].key;
    const oneRes = await request(app)
      .get(`/api/training-types/${key}`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(oneRes.status).toBe(200);
    expect(oneRes.body.name).toBeTruthy();
  });

  it('GET /api/training-types/:type 404s for an unknown type', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .get('/api/training-types/not-a-real-type')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TRAINING_TYPE_NOT_FOUND');
  });

  it('GET /api/training-plan/stats reflects this user\'s goals only', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    await pool.query(
      `INSERT INTO goals (user_id, title, goal_type, target_value, current_value)
       VALUES ($1, 'A goal', 'distance', 100, 50)`,
      [userA.id]
    );

    const statsA = await request(app)
      .get('/api/training-plan/stats')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(statsA.status).toBe(200);
    expect(statsA.body.totalGoals).toBe(1);
    expect(statsA.body.averageProgress).toBeCloseTo(50, 5);

    const statsB = await request(app)
      .get('/api/training-plan/stats')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(statsB.status).toBe(200);
    expect(statsB.body.totalGoals).toBe(0);
    expect(statsB.body.averageProgress).toBe(0);
  });

  it('POST /api/training-plan/custom requires dayKey and training', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/training-plan/custom')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ dayKey: 'monday' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('custom training: create (simple) -> read via training-plan -> delete, scoped per user', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const createRes = await request(app)
      .post('/api/training-plan/custom')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({
        dayKey: 'monday',
        training: { type: 'endurance', name: 'Long ride', details: { duration: '3h' } },
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);

    const planA = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(planA.status).toBe(200);
    expect(planA.body.customPlan.monday).toEqual({
      type: 'endurance',
      name: 'Long ride',
      details: { duration: '3h' },
    });

    // B's plan is unaffected — custom trainings are scoped per user.
    const planB = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${userB.token}`);
    expect(planB.status).toBe(200);
    expect(planB.body.customPlan).toEqual({});

    const row = await pool.query(
      'SELECT user_id FROM custom_training_plans WHERE day_key = $1',
      ['monday']
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].user_id).toBe(userA.id);

    const deleteRes = await request(app)
      .delete('/api/training-plan/custom/monday')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const afterDelete = await pool.query(
      'SELECT * FROM custom_training_plans WHERE user_id = $1 AND day_key = $2',
      [userA.id, 'monday']
    );
    expect(afterDelete.rows).toHaveLength(0);

    const planAfter = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${userA.token}`);
    expect(planAfter.body.customPlan.monday).toBeUndefined();
  });

  it('custom training: rest and composite day shapes round-trip through GET /api/training-plan', async () => {
    const user = await createUser(pool, app, request);

    const restRes = await request(app)
      .post('/api/training-plan/custom')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ dayKey: 'tuesday', training: { type: 'rest', name: 'Rest' } });
    expect(restRes.status).toBe(200);

    const compositeRes = await request(app)
      .post('/api/training-plan/custom')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        dayKey: 'wednesday',
        training: { type: 'composite', name: 'ignored', parts: [{ type: 'endurance' }, { type: 'sprint' }] },
      });
    expect(compositeRes.status).toBe(200);

    const plan = await request(app)
      .get('/api/training-plan')
      .set('Authorization', `Bearer ${user.token}`);
    expect(plan.status).toBe(200);
    expect(plan.body.customPlan.tuesday).toEqual({
      type: 'rest',
      name: 'Отдых',
      description: 'День отдыха',
    });
    expect(plan.body.customPlan.wednesday).toEqual({
      type: 'composite',
      name: '2 частей',
      parts: [{ type: 'endurance' }, { type: 'sprint' }],
    });
  });
});
