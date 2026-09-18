const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// One admin + one plain user shared across every describe below — each
// `createUser` does a real POST /api/login, which is rate-limited (10/15min
// per IP by authLimiter); this file exercises several admin routes, so
// logins are kept to a minimum instead of minting a fresh user per test.
describe('admin routes (server/routes/admin.js)', () => {
  let app, pool, admin, plainUser;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    admin = await createUser(pool, app, request, { email: `admin-${Date.now()}@example.com`, isAdmin: true });
    plainUser = await createUser(pool, app, request, { email: `user-${Date.now()}@example.com` });
  }, 30000);

  describe('GET /api/admin/users', () => {
    it('requires auth', async () => {
      expect((await request(app).get('/api/admin/users')).status).toBe(401);
    });

    it('rejects a non-admin with 403 FORBIDDEN', async () => {
      const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${plainUser.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('lets an admin list users, including both a regular user and themselves', async () => {
      const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      const emails = res.body.users.map((u) => u.email);
      expect(emails).toContain(plainUser.email);
      expect(emails).toContain(admin.email);
    });
  });

  describe('GET /api/admin/strava/sync-status', () => {
    it('is admin-only and reports totals with without_raw', async () => {
      expect(
        (await request(app).get('/api/admin/strava/sync-status').set('Authorization', `Bearer ${plainUser.token}`)).status
      ).toBe(403);
      const res = await request(app).get('/api/admin/strava/sync-status').set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.totals).toHaveProperty('activities');
      expect(res.body.totals).toHaveProperty('without_raw');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body).toHaveProperty('strava_limits');
    });
  });

  describe('GET /api/strava/limits', () => {
    it('requires auth', async () => {
      expect((await request(app).get('/api/strava/limits')).status).toBe(401);
    });

    it('rejects a non-admin with 403 FORBIDDEN', async () => {
      const res = await request(app).get('/api/strava/limits').set('Authorization', `Bearer ${plainUser.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('lets an admin read the current limits', async () => {
      const res = await request(app).get('/api/strava/limits').set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('limit15min');
    });
  });

  describe('POST /api/admin/users/:userId/unlink-strava', () => {
    it('requires auth', async () => {
      expect((await request(app).post('/api/admin/users/1/unlink-strava')).status).toBe(401);
    });

    it('rejects a non-admin with 403', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${admin.id}/unlink-strava`)
        .set('Authorization', `Bearer ${plainUser.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('lets an admin unlink a user with no linked Strava account (no-op deauthorize)', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${plainUser.id}/unlink-strava`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const row = await pool.query('SELECT strava_id, strava_access_token FROM users WHERE id = $1', [plainUser.id]);
      expect(row.rows[0].strava_id).toBeNull();
      expect(row.rows[0].strava_access_token).toBeNull();
    });
  });

  describe('DELETE /api/admin/users/:userId', () => {
    it('requires auth', async () => {
      expect((await request(app).delete('/api/admin/users/1')).status).toBe(401);
    });

    it('rejects a non-admin deleting another user, and that user still exists', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${admin.id}`)
        .set('Authorization', `Bearer ${plainUser.token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');

      const stillThere = await pool.query('SELECT id FROM users WHERE id = $1', [admin.id]);
      expect(stillThere.rows.length).toBe(1);
    });

    it('returns 404 for a user that does not exist', async () => {
      const res = await request(app)
        .delete('/api/admin/users/999999999')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('lets an admin delete a user and all their related rows', async () => {
      // A throwaway third user (not `plainUser`, which earlier tests still
      // reference) so this test's deletion doesn't affect the others.
      const target = await createUser(pool, app, request, { email: `del-${Date.now()}@example.com` });

      const res = await request(app)
        .delete(`/api/admin/users/${target.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deletedRecords.users).toBe(1);

      const stillThere = await pool.query('SELECT id FROM users WHERE id = $1', [target.id]);
      expect(stillThere.rows.length).toBe(0);
    });
  });
});
