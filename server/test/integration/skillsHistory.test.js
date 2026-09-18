// GET /api/skills-history/range (T-4.2, S-34) — real-Postgres coverage of
// the `?limit=` clamp added when routes/skillsHistory.js's pool.query calls
// moved into repositories/skills.js. Other /api/skills-history routes'
// admin-only gating is covered by test/integration/skills.test.js; this
// file is scoped to the /range behaviour change.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('GET /api/skills-history/range', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  async function seedSnapshots(userId, count) {
    for (let i = 0; i < count; i++) {
      // snapshot_date has a UNIQUE (user_id, snapshot_date) constraint (see
      // POST /'s ON CONFLICT) — space these out by a day each so seeding
      // several rows for one user doesn't collide.
      await pool.query(
        `INSERT INTO skills_history (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
         VALUES ($1, CURRENT_DATE - $2::int, 10, 10, 10, 10, 10, 10, $3)`,
        [userId, i, 1000 + i]
      );
    }
  }

  it('a huge ?limit= is clamped to 500 and still returns the seeded rows', async () => {
    const user = await createUser(pool, app, request);
    await seedSnapshots(user.id, 3);

    const res = await request(app)
      .get('/api/skills-history/range?limit=99999999')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    expect(res.body.length).toBeLessThanOrEqual(500);
  });

  it('a non-numeric ?limit= is a 400 VALIDATION_ERROR, not a 500', async () => {
    const user = await createUser(pool, app, request);
    await seedSnapshots(user.id, 1);

    const res = await request(app)
      .get('/api/skills-history/range?limit=abc')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('a small ?limit= returns exactly that many of the most recent snapshots', async () => {
    const user = await createUser(pool, app, request);
    await seedSnapshots(user.id, 3);

    const res = await request(app)
      .get('/api/skills-history/range?limit=2')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('with no ?limit=, falls back to the date-range query', async () => {
    const user = await createUser(pool, app, request);
    await seedSnapshots(user.id, 2);

    const res = await request(app)
      .get('/api/skills-history/range')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(user.id);
    expect(Array.isArray(res.body.snapshots)).toBe(true);
    expect(res.body.snapshots.length).toBe(2);
  });
});
