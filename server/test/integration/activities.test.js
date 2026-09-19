// Activities routes (T-4.1 domain extraction): GET /api/activities,
// GET /api/activities/:id, GET /api/activities/:id/streams,
// GET /api/activities/:id/ftp-analysis, POST /api/activities/cache/clear,
// GET /api/activities/:id/ai-analysis, GET /api/activities/:id/meta-goals-progress
// and POST /api/ai-analysis — real-Postgres coverage of routes/activities.js
// + routes/aiAnalysis.js + services/activities.js + repositories/activities.js.
// `getActivities`/`getActivity`/`getStreams` are Strava-backed, so happy
// paths spy on them per this suite's existing convention (see
// achievementsSnapshot.test.js/bikes.test.js) rather than hit the network;
// `analyzeTraining` (OpenAI-backed) is likewise mocked for its one cheap
// happy path.
//
// A single user is created once and reused across every test in this file
// (rather than one per test) — `POST /api/login` is behind `authLimiter`
// (max 10/15min per IP, see middleware/rateLimits.js) and this file has far
// more than 10 cases; every mock here is `vi.spyOn(...).mockRestore()`'d in
// a `finally`, so reusing the user is safe (no state leaks between cases
// other than the one test that seeds its own goals/meta_goals rows, which
// no other test in this file reads).
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('activities routes (real Postgres)', () => {
  let app, pool, user;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    user = await createUser(pool, app, request);
  }, 30000);

  it('401s without a token on every route', async () => {
    const routes = [
      ['get', '/api/activities'],
      ['get', '/api/activities/123'],
      ['get', '/api/activities/123/streams'],
      ['get', '/api/activities/123/ftp-analysis'],
      ['post', '/api/activities/cache/clear'],
      ['get', '/api/activities/123/ai-analysis'],
      ['get', '/api/activities/123/meta-goals-progress'],
      ['post', '/api/ai-analysis'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(typeof res.body.error).toBe('string');
      expect(typeof res.body.code).toBe('string');
    }
  });

  describe('GET /api/activities', () => {
    it('happy path: returns activities from stravaActivities.getActivities', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const fixture = [{ id: 700001, name: 'Morning ride', type: 'Ride', start_date: new Date().toISOString() }];
      const spy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue(fixture);
      try {
        const res = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(fixture);
      } finally {
        spy.mockRestore();
      }
    });

    it('maps a StravaNotLinkedError to an empty array with 200 (not an error)', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const stravaTokens = require('../../services/strava/tokens');
      const spy = vi.spyOn(stravaActivities, 'getActivities').mockRejectedValue(new stravaTokens.StravaNotLinkedError());
      try {
        const res = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });

    it('maps a StravaRateLimitError to 429 via stravaErrorResponse', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const stravaClient = require('../../services/strava/client');
      const spy = vi.spyOn(stravaActivities, 'getActivities').mockRejectedValue(new stravaClient.StravaRateLimitError('rate limited', 60));
      try {
        const res = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('RATE_LIMITED');
        expect(res.body.retryAfter).toBe(60);
      } finally {
        spy.mockRestore();
      }
    });

    // S-34: opt-in pagination on top of stravaActivities.getActivities(),
    // backward compatible (no `?limit` -> unchanged full-list response).
    describe('pagination (S-34)', () => {
      // 5 activities, same-day start_dates included so the strava_id DESC
      // tiebreaker in services/activities.js sortActivitiesDesc is actually
      // exercised, not just a start_date sort.
      const baseDate = new Date('2026-01-01T10:00:00.000Z');
      const fixture = [5, 4, 3, 2, 1].map((n) => ({
        id: 800000 + n,
        strava_id: 800000 + n,
        name: `Ride ${n}`,
        type: 'Ride',
        // ids 5 and 4 share the same (most recent) start_date, to test the
        // strava_id DESC tiebreaker; 3/2/1 are each a day older than the last.
        start_date: new Date(baseDate.getTime() - (n >= 4 ? 0 : (4 - n) * 86400000)).toISOString(),
      }));
      // Expected DESC order: start_date DESC, then strava_id DESC for ties.
      // n=5 and n=4 tie on start_date -> id 800005 first, then 800004, then
      // by decreasing start_date: n=3, n=2, n=1.
      const expectedOrderIds = [800005, 800004, 800003, 800002, 800001];

      it('no params: full list + X-Total-Count, no X-Next-Cursor', async () => {
        const stravaActivities = require('../../services/strava/activities');
        const spy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue(fixture);
        try {
          const res = await request(app).get('/api/activities').set('Authorization', `Bearer ${user.token}`);
          expect(res.status).toBe(200);
          expect(res.body).toEqual(fixture);
          expect(res.headers['x-total-count']).toBe('5');
          expect(res.headers['x-next-cursor']).toBeUndefined();
        } finally {
          spy.mockRestore();
        }
      });

      it('?limit=2 returns 2 items (start_date DESC, strava_id DESC) + X-Next-Cursor', async () => {
        const stravaActivities = require('../../services/strava/activities');
        const spy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue(fixture);
        try {
          const res = await request(app)
            .get('/api/activities')
            .query({ limit: 2 })
            .set('Authorization', `Bearer ${user.token}`);
          expect(res.status).toBe(200);
          expect(res.body).toHaveLength(2);
          expect(res.body.map((a) => a.id)).toEqual(expectedOrderIds.slice(0, 2));
          expect(res.headers['x-total-count']).toBe('5');
          expect(typeof res.headers['x-next-cursor']).toBe('string');

          // Following the cursor returns the NEXT 2 items, no overlap with
          // the first page.
          const page2 = await request(app)
            .get('/api/activities')
            .query({ limit: 2, cursor: res.headers['x-next-cursor'] })
            .set('Authorization', `Bearer ${user.token}`);
          expect(page2.status).toBe(200);
          expect(page2.body).toHaveLength(2);
          expect(page2.body.map((a) => a.id)).toEqual(expectedOrderIds.slice(2, 4));
          expect(typeof page2.headers['x-next-cursor']).toBe('string');

          // Last page: 1 remaining item, no X-Next-Cursor.
          const page3 = await request(app)
            .get('/api/activities')
            .query({ limit: 2, cursor: page2.headers['x-next-cursor'] })
            .set('Authorization', `Bearer ${user.token}`);
          expect(page3.status).toBe(200);
          expect(page3.body).toHaveLength(1);
          expect(page3.body.map((a) => a.id)).toEqual(expectedOrderIds.slice(4, 5));
          expect(page3.headers['x-next-cursor']).toBeUndefined();
        } finally {
          spy.mockRestore();
        }
      });

      it.each([['0'], ['abc'], ['9999']])('?limit=%s -> 400 VALIDATION_ERROR', async (limit) => {
        const res = await request(app)
          .get('/api/activities')
          .query({ limit })
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('GET /api/activities/:id', () => {
    it('404s for an activity Strava reports as not found', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockRejectedValue({ response: { status: 404 } });
      try {
        const res = await request(app).get('/api/activities/999999').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ACTIVITY_NOT_FOUND');
      } finally {
        spy.mockRestore();
      }
    });

    it('happy path: returns the activity', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const fixture = { id: 700002, name: 'Afternoon ride' };
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockResolvedValue(fixture);
      try {
        const res = await request(app).get('/api/activities/700002').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(fixture);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('GET /api/activities/:id/streams', () => {
    it('happy path: returns streams for the activity', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const fixture = { heartrate: { data: [100, 110, 120] }, time: { data: [0, 1, 2] } };
      const spy = vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(fixture);
      try {
        const res = await request(app).get('/api/activities/700003/streams').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(fixture);
      } finally {
        spy.mockRestore();
      }
    });

    it('maps a StravaNotLinkedError to 401', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const stravaTokens = require('../../services/strava/tokens');
      const spy = vi.spyOn(stravaActivities, 'getStreams').mockRejectedValue(new stravaTokens.StravaNotLinkedError());
      try {
        const res = await request(app).get('/api/activities/700003/streams').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('STRAVA_NOT_LINKED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('POST /api/activities/cache/clear', () => {
    it('200s and invalidates the cache', async () => {
      const res = await request(app).post('/api/activities/cache/clear').set('Authorization', `Bearer ${user.token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/activities/:id/ai-analysis', () => {
    it('404s (STRAVA_NOT_LINKED) when Strava is not linked', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const stravaTokens = require('../../services/strava/tokens');
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockRejectedValue(new stravaTokens.StravaNotLinkedError());
      try {
        const res = await request(app).get('/api/activities/700004/ai-analysis').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('STRAVA_NOT_LINKED');
      } finally {
        spy.mockRestore();
      }
    });

    it('happy path: builds a summary from the activity and returns the (mocked) AI analysis', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const aiAnalysis = require('../../aiAnalysis');
      const activitySpy = vi.spyOn(stravaActivities, 'getActivity').mockResolvedValue({
        name: 'Test ride',
        start_date: new Date().toISOString(),
        distance: 20000,
        moving_time: 3600,
        elapsed_time: 3700,
        average_speed: 5.5,
        max_speed: 10,
        average_heartrate: 140,
        max_heartrate: 170,
        average_cadence: 85,
        average_temp: 20,
        total_elevation_gain: 100,
        elev_high: 200,
        average_watts: 150,
        max_watts: 300,
      });
      const analyzeSpy = vi.spyOn(aiAnalysis, 'analyzeTraining').mockResolvedValue('Great ride!');
      try {
        const res = await request(app).get('/api/activities/700005/ai-analysis').set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.analysis).toBe('Great ride!');
        expect(analyzeSpy).toHaveBeenCalledTimes(1);
        expect(analyzeSpy.mock.calls[0][0]).toMatchObject({ name: 'Test ride', distance_km: '20.00' });
      } finally {
        activitySpy.mockRestore();
        analyzeSpy.mockRestore();
      }
    });
  });

  describe('POST /api/ai-analysis', () => {
    // T-7.1: the contract() middleware now 400s a missing `summary` before
    // the handler's own `if (!summary)` check runs — same 400 status, but
    // VALIDATION_ERROR (the contract's uniform code) instead of the
    // handler's old ad-hoc BAD_REQUEST.
    it('400s when no summary is provided', async () => {
      const res = await request(app)
        .post('/api/ai-analysis')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('happy path: forwards the summary to (mocked) analyzeTraining', async () => {
      const aiAnalysis = require('../../aiAnalysis');
      const analyzeSpy = vi.spyOn(aiAnalysis, 'analyzeTraining').mockResolvedValue('Nice effort!');
      try {
        const res = await request(app)
          .post('/api/ai-analysis')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ summary: { distance_km: '10.0' } });
        expect(res.status).toBe(200);
        expect(res.body.analysis).toBe('Nice effort!');
      } finally {
        analyzeSpy.mockRestore();
      }
    });
  });

  describe('GET /api/activities/:id/meta-goals-progress', () => {
    it('treats meta goals with a NULL/legacy status as active and drops orphan cache rows', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockResolvedValue({
        id: 700008, distance: 10000, total_elevation_gain: 50, moving_time: 1800,
      });
      try {
        // Legacy row: status never set (pre-enum production data).
        const mg = await pool.query(
          `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Legacy status', NULL) RETURNING id`,
          [user.id]
        );
        const metaGoalId = mg.rows[0].id;
        await pool.query(
          `INSERT INTO goals (user_id, meta_goal_id, title, target_value, unit, goal_type, current_value)
           VALUES ($1, $2, 'Ride 200km', 200, 'km', 'distance', 100)`,
          [user.id, metaGoalId]
        );
        // Orphan cache row for this activity: its meta goal is gone
        // (completed) — must not block recomputation.
        const done = await pool.query(
          `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Finished', 'completed') RETURNING id`,
          [user.id]
        );
        await pool.query(
          `INSERT INTO activity_meta_goals_progress (activity_id, meta_goal_id, user_id, progress_before, progress_after, contributions)
           VALUES ($1, $2, $3, 10, 20, '[]')`,
          ['700008', done.rows[0].id, user.id]
        );

        const res = await request(app)
          .get('/api/activities/700008/meta-goals-progress')
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.map((g) => g.id)).toEqual([metaGoalId]);
        expect(res.body[0].progress).toBe(50);

        const orphan = await pool.query(
          'SELECT 1 FROM activity_meta_goals_progress WHERE user_id = $1 AND meta_goal_id = $2',
          [user.id, done.rows[0].id]
        );
        expect(orphan.rows).toHaveLength(0);

        // Leave nothing "active" behind for the next test's exact-length assertions.
        await pool.query(`UPDATE meta_goals SET status = 'completed' WHERE user_id = $1`, [user.id]);
      } finally {
        spy.mockRestore();
      }
    });

    it('404s when the activity cannot be found', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockRejectedValue(new Error('not found'));
      try {
        const res = await request(app)
          .get('/api/activities/700006/meta-goals-progress')
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ACTIVITY_NOT_FOUND');
      } finally {
        spy.mockRestore();
      }
    });

    it('happy path: computes progress against an active meta-goal + sub-goal from seeded rows, then caches it', async () => {
      const stravaActivities = require('../../services/strava/activities');
      const activityFixture = {
        id: 700007,
        distance: 20000, // 20 km
        total_elevation_gain: 150,
        moving_time: 3600,
      };
      const spy = vi.spyOn(stravaActivities, 'getActivity').mockResolvedValue(activityFixture);
      try {
        const metaGoalRes = await pool.query(
          `INSERT INTO meta_goals (user_id, title, status) VALUES ($1, 'Base fitness', 'active') RETURNING id`,
          [user.id]
        );
        const metaGoalId = metaGoalRes.rows[0].id;
        await pool.query(
          `INSERT INTO goals (user_id, meta_goal_id, title, target_value, unit, goal_type, current_value)
           VALUES ($1, $2, 'Ride 100km', 100, 'km', 'distance', 50)`,
          [user.id, metaGoalId]
        );

        const res = await request(app)
          .get('/api/activities/700007/meta-goals-progress')
          .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(metaGoalId);
        expect(res.body[0].title).toBe('Base fitness');
        expect(res.body[0].progress).toBe(50); // current_value 50 / target 100 * 100
        expect(Array.isArray(res.body[0].contributions)).toBe(true);

        // Persisted — a second call for the same activity is served from
        // the activity_meta_goals_progress cache (repositories/activities.js).
        const cached = await pool.query(
          'SELECT * FROM activity_meta_goals_progress WHERE user_id = $1 AND activity_id = $2',
          [user.id, '700007']
        );
        expect(cached.rows).toHaveLength(1);

        const second = await request(app)
          .get('/api/activities/700007/meta-goals-progress')
          .set('Authorization', `Bearer ${user.token}`);
        expect(second.status).toBe(200);
        expect(second.body[0].progress).toBe(50);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
