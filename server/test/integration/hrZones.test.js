const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// T-3.1 (docs/audit/00-AUDIT-AND-PLAN.md T-3.1, docs/audit/layers/
// 04-cross-layer.md §4.4): `hr_zones` on the profile is always computed by
// the server from `@bikelab/shared/calc`'s `computeHrZones` — never the
// value a client sends.
describe('hr_zones — server-derived heart-rate zones', () => {
  let app, pool;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
  }, 30000);

  it('GET /api/user-profile derives hr_zones with the Karvonen method when max_hr and resting_hr are set', async () => {
    const user = await createUser(pool, app, request);

    const putRes = await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ max_hr: 190, resting_hr: 50 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.hr_zones.method).toBe('karvonen');

    const getRes = await request(app)
      .get('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.hr_zones.method).toBe('karvonen');
    expect(getRes.body.hr_zones.basis).toEqual({ max_hr: 190, resting_hr: 50 });
    expect(getRes.body.hr_zones.zones).toHaveLength(5);
    expect(getRes.body.hr_zones.zones[4].max).toBeNull();
  });

  it('switches to the LTHR method once lactate_threshold is set, even with max_hr/resting_hr present', async () => {
    const user = await createUser(pool, app, request);

    await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ max_hr: 190, resting_hr: 50 });

    const putRes = await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ lactate_threshold: 165 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.hr_zones.method).toBe('lthr');
    expect(putRes.body.hr_zones.basis.lactate_threshold).toBe(165);

    const getRes = await request(app)
      .get('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`);
    expect(getRes.body.hr_zones.method).toBe('lthr');
  });

  it('ignores a bogus client-sent hr_zones payload on PUT — GET still returns the derived value', async () => {
    const user = await createUser(pool, app, request);

    const putRes = await request(app)
      .put('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        max_hr: 190,
        resting_hr: 50,
        hr_zones: { method: 'bogus', basis: { max_hr: 1 }, zones: 'not-an-array' },
      });
    expect(putRes.status).toBe(200);
    expect(putRes.body.hr_zones.method).toBe('karvonen');

    // Confirm the stored column itself was left alone (not overwritten with
    // the bogus payload) — additive rule: DB column untouched, just no
    // longer client-writable.
    const row = await pool.query(
      `SELECT hr_zones FROM user_profiles WHERE user_id = $1`,
      [user.id]
    );
    const stored = row.rows[0]?.hr_zones;
    if (stored != null) {
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      expect(parsed?.method).not.toBe('bogus');
    }

    const getRes = await request(app)
      .get('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`);
    expect(getRes.body.hr_zones.method).toBe('karvonen');
    expect(getRes.body.hr_zones.zones).toHaveLength(5);
  });

  it('ignores hr_zones sent to POST /api/user-profile/onboarding', async () => {
    const user = await createUser(pool, app, request);
    // completeOnboarding's UPDATE only affects an existing user_profiles row
    // (created lazily by GET /api/user-profile) — pre-existing behaviour,
    // unrelated to T-3.1, so prime it first like a real onboarding client
    // would after loading the profile once.
    await request(app).get('/api/user-profile').set('Authorization', `Bearer ${user.token}`);

    const res = await request(app)
      .post('/api/user-profile/onboarding')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        age: 30,
        max_hr: 190,
        resting_hr: 50,
        experience_level: 'intermediate',
        hr_zones: { method: 'bogus' },
      });
    expect(res.status).toBe(200);
    expect(res.body.hr_zones.method).toBe('karvonen');
  });

  it('falls back to the %maxHR method when there is no max_hr/resting_hr/lactate_threshold at all', async () => {
    const user = await createUser(pool, app, request);

    const getRes = await request(app)
      .get('/api/user-profile')
      .set('Authorization', `Bearer ${user.token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.hr_zones.method).toBe('maxhr');
    expect(getRes.body.hr_zones.basis.max_hr).toBe(190);
  });
});
