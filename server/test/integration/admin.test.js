const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('admin routes', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('rejects a non-admin with 403 FORBIDDEN', async () => {
    const userA = await createUser(pool, app, request);
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${userA.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lets an admin list users, including both a regular user and themselves', async () => {
    const userA = await createUser(pool, app, request);
    const admin = await createUser(pool, app, request, { isAdmin: true });

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const emails = res.body.users.map((u) => u.email);
    expect(emails).toContain(userA.email);
    expect(emails).toContain(admin.email);
  });

  it('rejects a non-admin deleting another user, and that user still exists', async () => {
    const userA = await createUser(pool, app, request);
    const userB = await createUser(pool, app, request);

    const res = await request(app)
      .delete(`/api/admin/users/${userB.id}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');

    const stillThere = await pool.query('SELECT id FROM users WHERE id = $1', [userB.id]);
    expect(stillThere.rows.length).toBe(1);
  });
});

describe('GET /api/admin/strava/sync-status', () => {
  const request = require('supertest');
  const { bootstrap } = require('./setup');
  const { createUser } = require('./helpers');
  let app, pool;
  beforeAll(async () => { ({ app, pool } = await bootstrap()); }, 30000);

  it('is admin-only and reports totals with without_raw', async () => {
    const user = await createUser(pool, app, request, { email: `ss-u-${Date.now()}@example.com` });
    const admin = await createUser(pool, app, request, { email: `ss-a-${Date.now()}@example.com`, isAdmin: true });
    expect((await request(app).get('/api/admin/strava/sync-status').set('Authorization', `Bearer ${user.token}`)).status).toBe(403);
    const res = await request(app).get('/api/admin/strava/sync-status').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toHaveProperty('activities');
    expect(res.body.totals).toHaveProperty('without_raw');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body).toHaveProperty('strava_limits');
  });
});
