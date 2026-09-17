const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('analytics snapshot + achievements routes', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    // seedAchievements(pool) is only ever invoked from server.js's main(),
    // which the integration bootstrap deliberately never calls (it just
    // requires the app) — seed the catalog ourselves so
    // GET /api/achievements has something to return.
    const { seedAchievements } = require('../../achievements');
    await seedAchievements(pool);
  }, 30000);

  describe('POST /api/analytics-snapshot', () => {
    it('401s without a token', async () => {
      const res = await request(app).post('/api/analytics-snapshot').send({ lastActivityId: 1 });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('403s for a non-admin', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .post('/api/analytics-snapshot')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ lastActivityId: 1 });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('lets an admin save a snapshot, which then shows up in latest/history', async () => {
      const admin = await createUser(pool, app, request, { isAdmin: true });

      const createRes = await request(app)
        .post('/api/analytics-snapshot')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          lastActivityId: 555,
          power: { avg: 200, max: 300, min: 100 },
          heart: { avg: 140, max: 180, min: 90 },
          speed: { avg: 25, max: 40, min: 10 },
          cadence: { avg: 85, max: 100, min: 60 },
          vo2max: 45.5,
          activitiesCount: 3,
        });
      expect(createRes.status).toBe(200);
      expect(createRes.body).toEqual({ saved: true });

      const latestRes = await request(app)
        .get('/api/analytics-snapshot/latest')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(latestRes.status).toBe(200);
      expect(latestRes.body.last_activity_id).toBe('555');
      expect(Number(latestRes.body.avg_power)).toBe(200);

      const historyRes = await request(app)
        .get('/api/analytics-snapshot/history')
        .set('Authorization', `Bearer ${admin.token}`);
      expect(historyRes.status).toBe(200);
      expect(Array.isArray(historyRes.body)).toBe(true);
      expect(historyRes.body.some((row) => row.last_activity_id === '555')).toBe(true);
    });
  });

  describe('GET /api/analytics-snapshot/latest', () => {
    it('401s without a token', async () => {
      const res = await request(app).get('/api/analytics-snapshot/latest');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns null for a fresh user with no snapshot', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/analytics-snapshot/latest')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('GET /api/analytics-snapshot/history', () => {
    it('401s without a token', async () => {
      const res = await request(app).get('/api/analytics-snapshot/history');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns an empty array for a fresh user with no snapshots', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/analytics-snapshot/history')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/achievements', () => {
    it('401s without a token', async () => {
      const res = await request(app).get('/api/achievements');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns the seeded achievements catalog', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/achievements')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.some((a) => a.key === 'trail_mark')).toBe(true);
    });
  });

  describe('GET /api/achievements/me', () => {
    it('401s without a token', async () => {
      const res = await request(app).get('/api/achievements/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('returns all achievements locked (0%) for a fresh user', async () => {
      const user = await createUser(pool, app, request);
      const res = await request(app)
        .get('/api/achievements/me')
        .set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.achievements)).toBe(true);
      expect(res.body.achievements.length).toBeGreaterThan(0);
      expect(res.body.achievements.every((a) => a.unlocked === false)).toBe(true);
      expect(res.body.stats.unlocked).toBe(0);
      expect(res.body.stats.progress_pct).toBe(0);
    });
  });

  describe('POST /api/achievements/evaluate', () => {
    it('401s without a token', async () => {
      const res = await request(app).post('/api/achievements/evaluate');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('evaluates with no unlocks when Strava is not linked (getActivities mocked to [])', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const spy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([]);
      try {
        const user = await createUser(pool, app, request);
        const res = await request(app)
          .post('/api/achievements/evaluate')
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.newly_unlocked).toEqual([]);
        expect(res.body.total_unlocked).toBe(0);
        expect(typeof res.body.total_achievements).toBe('number');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
