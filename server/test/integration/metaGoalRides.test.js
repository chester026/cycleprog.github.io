const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// POST /api/meta-goals/:id/complete | /reopen, GET /:id/rides, and the goal
// measuring window (active goals stay open past target_date, completed goals
// freeze at completed_at, the deadline day counts in full).
//
// Rides are seeded into synced_activities like goalsProgress.test.js does and
// all lie >30 days back, outside syncIncremental's recent-days prune window.
describe('meta-goal rides + window (real Postgres)', () => {
  let app, pool;
  const DAY_MS = 86400000;
  const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  }, 30000);

  // Two logins for the whole file — /api/login is rate-limited per IP.
  let rider, other;
  beforeAll(async () => {
    rider = await createUser(pool, app, request);
    other = await createUser(pool, app, request);
    for (const u of [rider, other]) {
      await pool.query(
        `UPDATE users SET strava_id = $2, strava_access_token = 'test-access', strava_refresh_token = 'test-refresh',
           strava_expires_at = $3 WHERE id = $1`,
        [u.id, 655000 + u.id, Math.floor(Date.now() / 1000) + 3600]
      );
    }
  });

  // Replaces the user's synced rides; ids default to unique per call.
  let nextRideId = 9100000;
  async function seedRides(user, rides) {
    const strava = require('../../services/strava/activities');
    await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [user.id]);
    await strava.syncActivitiesToDb(user.id, rides.map((r) => ({
      id: r.id ?? nextRideId++,
      name: r.name ?? 'Ride',
      type: 'Ride',
      start_date: r.start.toISOString(),
      distance: r.km * 1000,
      moving_time: 3600,
      total_elevation_gain: 100,
      average_speed: 8,
    })));
    strava.invalidate(user.id);
    return user;
  }

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  async function insertMetaGoal(user, { status = 'active', createdDaysAgo = 90, targetDate = null, completedAt = null } = {}) {
    const r = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status, target_date, created_at, completed_at)
       VALUES ($1, 'Half of Island', $2, $3, $4, $5) RETURNING id`,
      [user.id, status, targetDate, daysAgo(createdDaysAgo), completedAt]
    );
    return r.rows[0].id;
  }

  async function addTotalKmSubGoal(user, metaGoalId) {
    await pool.query(
      `INSERT INTO goals (user_id, meta_goal_id, title, target_value, current_value, unit, source, metric, priority)
       VALUES ($1, $2, 'Total km', 500, 0, 'km', 'activity', $3, 1)`,
      [user.id, metaGoalId, JSON.stringify({ source: 'activity', aggregate: 'sum', field: 'distance', transform: 0.001 })]
    );
  }

  async function totalKm(user, metaGoalId) {
    const res = await request(app).get(`/api/meta-goals/${metaGoalId}`).set(auth(user));
    expect(res.status).toBe(200);
    return Number(res.body.subGoals[0].current_value);
  }

  describe('complete / reopen / rides', () => {
    it('completes with two rides: completed_at is the latest ride, rides are listed and in GET detail', async () => {
      const early = daysAgo(40);
      const late = daysAgo(35);
      const user = await seedRides(rider, [{ id: 9000001, name: 'Warm-up', start: early, km: 40 }, { id: 9000002, name: 'Garda loop', start: late, km: 140 }]);
      const id = await insertMetaGoal(user);

      const res = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ activity_ids: [9000001, 9000002] });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(new Date(res.body.completed_at).getTime()).toBe(late.getTime());
      expect(res.body.rides.map((r) => r.strava_id)).toEqual([9000002, 9000001]);
      expect(res.body.rides[0]).toMatchObject({ name: 'Garda loop', distance: 140000, moving_time: 3600 });

      const list = await request(app).get(`/api/meta-goals/${id}/rides`).set(auth(user));
      expect(list.status).toBe(200);
      expect(list.body.rides).toHaveLength(2);

      const detail = await request(app).get(`/api/meta-goals/${id}`).set(auth(user));
      expect(detail.body.rides.map((r) => r.strava_id)).toEqual([9000002, 9000001]);
      expect(detail.body.metaGoal.status).toBe('completed');
    });

    it('an explicit completed_at wins over the ride date, and re-completing replaces the rides', async () => {
      const user = await seedRides(rider, [{ id: 9000011, start: daysAgo(40), km: 10 }, { id: 9000012, start: daysAgo(39), km: 10 }]);
      const id = await insertMetaGoal(user);
      await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ activity_ids: [9000011] });

      const res = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user))
        .send({ activity_ids: [9000012], completed_at: '2026-09-30T10:00:00.000Z' });
      expect(res.status).toBe(200);
      expect(new Date(res.body.completed_at).toISOString()).toBe('2026-09-30T10:00:00.000Z');
      expect(res.body.rides.map((r) => r.strava_id)).toEqual([9000012]);
    });

    it('rejects an activity id that is not one of the user\'s synced rides and changes nothing', async () => {
      await seedRides(other, [{ id: 9000021, start: daysAgo(40), km: 10 }]);
      const user = await seedRides(rider, [{ id: 9000022, start: daysAgo(40), km: 10 }]);
      const id = await insertMetaGoal(user);

      const unknown = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ activity_ids: [9000022, 123456789] });
      expect(unknown.status).toBe(400);
      expect(unknown.body.code).toBe('UNKNOWN_ACTIVITY');
      // owner's ride is "unknown" to this user
      const foreign = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ activity_ids: [9000021] });
      expect(foreign.status).toBe(400);

      const row = await pool.query('SELECT status, completed_at FROM meta_goals WHERE id = $1', [id]);
      expect(row.rows[0]).toMatchObject({ status: 'active', completed_at: null });
    });

    it('rejects an unparsable completed_at with 400', async () => {
      const user = await seedRides(rider, []);
      const id = await insertMetaGoal(user);
      const res = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ completed_at: 'yesterday-ish' });
      expect(res.status).toBe(400);
    });

    it('completes without rides: completed_at is now and rides is empty', async () => {
      const user = await seedRides(rider, []);
      const id = await insertMetaGoal(user);
      const res = await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({});
      expect(res.status).toBe(200);
      expect(Math.abs(new Date(res.body.completed_at).getTime() - Date.now())).toBeLessThan(60000);
      expect(res.body.rides).toEqual([]);
    });

    it('reopen sets the goal active, clears completed_at and the attached rides', async () => {
      const user = await seedRides(rider, [{ id: 9000031, start: daysAgo(40), km: 10 }]);
      const id = await insertMetaGoal(user);
      await request(app).post(`/api/meta-goals/${id}/complete`).set(auth(user)).send({ activity_ids: [9000031] });

      const res = await request(app).post(`/api/meta-goals/${id}/reopen`).set(auth(user));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'active', completed_at: null });
      const rides = await request(app).get(`/api/meta-goals/${id}/rides`).set(auth(user));
      expect(rides.body.rides).toEqual([]);
    });

    it("another user's goal is 404 for complete, reopen and rides", async () => {
      const id = await insertMetaGoal(rider);

      for (const [method, path] of [['post', `/api/meta-goals/${id}/complete`], ['post', `/api/meta-goals/${id}/reopen`], ['get', `/api/meta-goals/${id}/rides`]]) {
        const res = await request(app)[method](path).set(auth(other)).send({});
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('META_GOAL_NOT_FOUND');
      }
      const row = await pool.query('SELECT status FROM meta_goals WHERE id = $1', [id]);
      expect(row.rows[0].status).toBe('active');
    });

    it('PUT status=completed still stamps completed_at (legacy path)', async () => {
      const user = await seedRides(rider, []);
      const id = await insertMetaGoal(user);
      const res = await request(app).put(`/api/meta-goals/${id}`).set(auth(user)).send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.completed_at).toBeTruthy();
    });
  });

  describe('measuring window', () => {
    it('an active goal past its target_date still counts rides after the deadline', async () => {
      const user = await seedRides(rider, [{ start: daysAgo(60), km: 100 }, { start: daysAgo(40), km: 50 }]);
      const id = await insertMetaGoal(user, { createdDaysAgo: 90, targetDate: daysAgo(50).toISOString().slice(0, 10) });
      await addTotalKmSubGoal(user, id);
      expect(await totalKm(user, id)).toBe(150);
    });

    it('a ride at 07:00 on the deadline day counts', async () => {
      const deadline = daysAgo(50);
      const ride = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate(), 7, 0, 0);
      const user = await seedRides(rider, [{ start: ride, km: 120 }]);
      const id = await insertMetaGoal(user, { status: 'completed', completedAt: daysAgo(10), targetDate: ride.toISOString().slice(0, 10) });
      await addTotalKmSubGoal(user, id);
      expect(await totalKm(user, id)).toBe(120);
    });

    it('a completed goal does not count rides after completed_at', async () => {
      const user = await seedRides(rider, [{ start: daysAgo(60), km: 100 }, { start: daysAgo(40), km: 50 }]);
      const id = await insertMetaGoal(user, { status: 'completed', createdDaysAgo: 90, targetDate: daysAgo(30).toISOString().slice(0, 10), completedAt: daysAgo(50) });
      await addTotalKmSubGoal(user, id);
      expect(await totalKm(user, id)).toBe(100);
    });

    it('pace keeps measuring against target_date for an active goal', async () => {
      const user = await seedRides(rider, [{ start: daysAgo(60), km: 100 }]);
      const id = await insertMetaGoal(user, { createdDaysAgo: 90, targetDate: daysAgo(-30).toISOString().slice(0, 10) });
      await addTotalKmSubGoal(user, id);
      const res = await request(app).get(`/api/meta-goals/${id}`).set(auth(user));
      const { pace } = res.body.subGoals[0];
      expect(pace.daysRemaining).toBeGreaterThanOrEqual(29);
      expect(pace.daysRemaining).toBeLessThanOrEqual(31);
    });
  });
});
