// GET /api/bikes, GET /api/bikes/:bikeId/health, PUT /api/bikes/:bikeId/labels,
// POST /api/bikes/:bikeId/components/:component/reset, POST
// /api/bikes/:bikeId/onboarding (T-4.1 domain extraction) — real-Postgres
// coverage of routes/bikes.js + repositories/bikes.js's SQL. `getActivities`/
// `getBikes` are Strava-backed, so happy paths spy on them (per this suite's
// existing convention — see achievementsSnapshot.test.js) rather than hit
// the network.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('bikes/garage-health routes', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('401s without a token on every route', async () => {
    const getBikesRes = await request(app).get('/api/bikes');
    expect(getBikesRes.status).toBe(401);

    const healthRes = await request(app).get('/api/bikes/b1/health');
    expect(healthRes.status).toBe(401);

    const labelsRes = await request(app).put('/api/bikes/b1/labels').send({ labels: [] });
    expect(labelsRes.status).toBe(401);

    const resetRes = await request(app).post('/api/bikes/b1/components/chain/reset');
    expect(resetRes.status).toBe(401);

    const onboardingRes = await request(app).post('/api/bikes/b1/onboarding').send({ resets: [] });
    expect(onboardingRes.status).toBe(401);
  });

  it('GET /api/bikes returns [] for a user with no Strava link', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app).get('/api/bikes').set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('PUT /api/bikes/:bikeId/labels writes rows, then GET /health reflects them back', async () => {
    const user = await createUser(pool, app, request);
    const bikeId = 'b-labels';

    const putRes = await request(app)
      .put(`/api/bikes/${bikeId}/labels`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        labels: [
          { target_type: 'group', target_key: 'wheels', custom_name: 'Hunt 40 Limitless' },
          { target_type: 'component', target_key: 'tires', custom_name: 'Conti GP5000' },
        ],
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ success: true, count: 2 });

    const rows = await pool.query(
      'SELECT target_type, target_key, custom_name FROM bike_component_labels WHERE user_id = $1 AND bike_id = $2 ORDER BY target_type',
      [user.id, bikeId]
    );
    expect(rows.rows).toHaveLength(2);

    const stravaActivities = require('../../services/strava/activities');
    const spy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([]);
    try {
      const healthRes = await request(app)
        .get(`/api/bikes/${bikeId}/health`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.groupLabels).toEqual({ wheels: 'Hunt 40 Limitless' });
      expect(healthRes.body.componentLabels).toEqual({ tires: 'Conti GP5000' });
    } finally {
      spy.mockRestore();
    }
  });

  it('PUT /api/bikes/:bikeId/labels rejects an empty/invalid body', async () => {
    const user = await createUser(pool, app, request);
    const emptyRes = await request(app)
      .put('/api/bikes/b1/labels')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ labels: [] });
    expect(emptyRes.status).toBe(400);

    const invalidRes = await request(app)
      .put('/api/bikes/b1/labels')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ labels: [{ target_type: 'group', target_key: 'not-a-real-group', custom_name: 'x' }] });
    expect(invalidRes.status).toBe(400);
  });

  it('POST /api/bikes/:bikeId/components/:component/reset writes a reset row', async () => {
    const user = await createUser(pool, app, request);
    const bikeId = 'b-reset';

    const res = await request(app)
      .post(`/api/bikes/${bikeId}/components/chain/reset`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, component: 'chain', resetKm: 0 });

    const rows = await pool.query(
      'SELECT component, reset_km FROM bike_component_resets WHERE user_id = $1 AND bike_id = $2',
      [user.id, bikeId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].component).toBe('chain');
  });

  it('POST /api/bikes/:bikeId/components/:component/reset rejects an unknown component', async () => {
    const user = await createUser(pool, app, request);
    const res = await request(app)
      .post('/api/bikes/b1/components/not-a-real-component/reset')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(400);
  });

  it('POST /api/bikes/:bikeId/onboarding writes one row per valid component', async () => {
    const user = await createUser(pool, app, request);
    const bikeId = 'b-onboard';

    const res = await request(app)
      .post(`/api/bikes/${bikeId}/onboarding`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        resets: [
          { component: 'chain', resetKm: 100 },
          { component: 'cassette', resetKm: 100 },
          { component: 'not-a-real-component', resetKm: 5 }, // dropped
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, count: 2 });

    const rows = await pool.query(
      `SELECT component, reset_km, source FROM bike_component_resets
       WHERE user_id = $1 AND bike_id = $2 ORDER BY component`,
      [user.id, bikeId]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((r) => r.source === 'onboarding')).toBe(true);
  });

  it('POST /api/bikes/:bikeId/onboarding rejects an empty/all-invalid body', async () => {
    const user = await createUser(pool, app, request);
    const emptyRes = await request(app)
      .post('/api/bikes/b1/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ resets: [] });
    expect(emptyRes.status).toBe(400);

    const allInvalidRes = await request(app)
      .post('/api/bikes/b1/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ resets: [{ component: 'not-a-real-component', resetKm: 5 }] });
    expect(allInvalidRes.status).toBe(400);
  });

  it('GET /api/bikes/:bikeId/health happy path computes wear from real Postgres rows', async () => {
    const user = await createUser(pool, app, request);
    const bikeId = 'b-health';

    await pool.query('INSERT INTO user_profiles (user_id, weight) VALUES ($1, $2)', [user.id, 80]);
    await pool.query(
      `INSERT INTO skills_history (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
       VALUES ($1, NOW(), 40, 60, 50, 50, 50, 50, 1)`,
      [user.id]
    );
    await pool.query(
      "INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km, source) VALUES ($1, $2, 'chain', 500, 'manual')",
      [user.id, bikeId]
    );

    const stravaActivities = require('../../services/strava/activities');
    const activitiesSpy = vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([
      { gear_id: bikeId, distance: 1_000_000, total_elevation_gain: 5000, average_speed: 8, max_speed: 15, average_watts: 180 },
      { gear_id: 'some-other-bike', distance: 500_000, total_elevation_gain: 1000, average_speed: 7, max_speed: 12, average_watts: 150 },
    ]);
    try {
      const res = await request(app)
        .get(`/api/bikes/${bikeId}/health`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.bikeId).toBe(bikeId);
      expect(res.body.riderWeight).toBe(80);
      expect(res.body.totalKm).toBe(1000); // 1,000,000m from the one matching activity
      expect(res.body.riderProfile.profile).toBeTruthy();
      expect(res.body.onboardingCompleted).toBe(true);
      expect(res.body.components.length).toBeGreaterThan(0);

      const chain = res.body.components.find((c) => c.id === 'chain');
      expect(chain.lastResetKm).toBe(500);
      expect(chain.kmSinceReset).toBe(500); // 1000 total - 500 reset
      expect(typeof res.body.overallHealth).toBe('number');
      expect(res.body.nextService.component).toBeTruthy();
    } finally {
      activitiesSpy.mockRestore();
    }
  });
});
