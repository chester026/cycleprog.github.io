const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// T-2.2 (docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §6.1): request-body validation via the same zod schemas @bikelab/shared
// exports for clients, wired through middleware/validate.js.
describe('request-body validation (validateBody)', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('PUT /api/user-profile with a garbage-typed max_hr returns 400 VALIDATION_ERROR with details', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ max_hr: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.some((d) => d.path === 'max_hr')).toBe(true);
  });

  it('PUT /api/user-profile with a valid partial body still works (mobile-style partial update)', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ max_hr: 188, resting_hr: 52 });

    expect(res.status).toBe(200);
    expect(res.body.max_hr).toBe(188);
    expect(res.body.resting_hr).toBe(52);
  });

  it('POST /api/goals with a valid body still returns 200 as today', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Distance goal', target_value: 100, unit: 'km', goal_type: 'distance' });

    expect(res.status).toBe(200);
    expect(res.body.goal_type).toBe('distance');
  });

  it('POST /api/goals with a garbage-typed target_value returns 400 VALIDATION_ERROR', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'x', target_value: { not: 'a number' }, unit: 'km', goal_type: 'distance' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/login with a missing password returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/checklist with a valid body still works', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/checklist')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ section: 'Bike setup', item: 'Check tire pressure' });

    expect(res.status).toBe(200);
    expect(res.body.item).toBe('Check tire pressure');
  });

  it('POST /api/events with an invalid background_color returns 400 VALIDATION_ERROR', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Gran Fondo', start_date: '2026-10-01', background_color: 'blue' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
