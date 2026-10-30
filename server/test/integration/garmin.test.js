// Garmin Connect IQ bridge on real Postgres (docs/plans/garmin-connect-iq.md
// §2.3): the pairing state machine and the two-token separation.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// Two users for the whole file (POST /api/login is behind authLimiter, 10 per
// 15 min per IP — see activities.test.js for the same convention). Pairings
// are independent rows, so tests don't step on each other through the users.
describe('garmin pairing + device token', () => {
  let app, pool, user, other;

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    user = await createUser(pool, app, request);
    other = await createUser(pool, app, request);
    const { stravaHttp } = require('../../lib/http');
    stravaHttp.request = async ({ url }) => {
      if (String(url).includes('/athlete/activities')) return { data: [], headers: {} };
      throw new Error(`unexpected stravaHttp.request in this test: ${url}`);
    };
  }, 30000);

  async function startPairing(deviceId = `edge-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    const res = await request(app).post('/api/garmin/pair/start').send({ device_id: deviceId, device_name: 'Edge 1040' });
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[0-9]{6}$/);
    expect(res.body.poll_key).toBeTruthy();
    return res.body;
  }

  async function pairDevice(user) {
    const start = await startPairing();
    const confirm = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: start.code });
    expect(confirm.status).toBe(200);
    const poll = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.poll_key });
    expect(poll.status).toBe(200);
    expect(poll.body.status).toBe('ok');
    return { start, token: poll.body.token };
  }

  it('start → pending → confirm → ok exactly once → gone', async () => {
    const start = await startPairing();

    const pending = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.poll_key });
    expect(pending.status).toBe(200);
    expect(pending.body).toEqual({ status: 'pending' });

    const confirm = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: ` ${start.code} ` });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toEqual({ success: true, device_name: 'Edge 1040' });

    const ok = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.poll_key });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ok');
    const payload = jwt.decode(ok.body.token);
    expect(payload.aud).toBe('garmin');
    expect(payload.userId).toBe(user.id);
    expect(payload.jti).toBeTruthy();

    const again = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.poll_key });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('GARMIN_PAIR_GONE');

    // The same code cannot be confirmed a second time.
    const reconfirm = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: start.code });
    expect(reconfirm.status).toBe(404);
    expect(reconfirm.body.code).toBe('GARMIN_CODE_NOT_FOUND');
  });

  it('confirm requires a session, rejects unknown / malformed codes', async () => {
    expect((await request(app).post('/api/garmin/pair/confirm').send({ code: '123456' })).status).toBe(401);
    const unknown = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: '000000' });
    expect([404, 200]).toContain(unknown.status); // 000000 could in theory be a live code
    const bad = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: '12ab' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('poll of an expired, unconfirmed attempt is gone', async () => {
    const start = await startPairing();
    await pool.query(`UPDATE garmin_devices SET expires_at = NOW() - INTERVAL '1 minute' WHERE poll_key = $1`, [start.poll_key]);
    const res = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.poll_key });
    expect(res.status).toBe(410);
    const unknown = await request(app).post('/api/garmin/pair/poll').send({ poll_key: 'nope' });
    expect(unknown.status).toBe(410);
  });

  it('device token works on /home only; session token is rejected there', async () => {
    const { token } = await pairDevice(user);

    const home = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body).toMatchObject({ v: 1, goals: [], last: null, bike: null });
    expect(typeof home.body.at).toBe('string');

    const elsewhere = await request(app).get('/api/goals').set('Authorization', `Bearer ${token}`);
    expect(elsewhere.status).toBe(401);
    const confirmWithDevice = await request(app)
      .post('/api/garmin/pair/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' });
    expect(confirmWithDevice.status).toBe(401);

    const sessionOnHome = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${user.token}`);
    expect(sessionOnHome.status).toBe(401);
  });

  it('home carries the active meta-goal with server-computed sub-goal progress', async () => {
    const { token } = await pairDevice(user);
    const metaRes = await pool.query(
      `INSERT INTO meta_goals (user_id, title, status, target_date) VALUES ($1, 'Base fitness', 'active', NOW() + INTERVAL '30 days') RETURNING id`,
      [user.id]
    );
    const metaGoalId = metaRes.rows[0].id;
    const goalRes = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Ride 100km', target_value: 100, unit: 'km', goal_type: 'distance', period: 'all', meta_goal_id: metaGoalId });
    expect(goalRes.status).toBe(200);

    const home = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${token}`);
    expect(home.status).toBe(200);
    const goal = home.body.goals.find((g) => g.id === metaGoalId);
    expect(goal).toBeTruthy();
    expect(goal.t).toBe('Base fitness');
    expect(goal.days).toBeGreaterThanOrEqual(29);
    expect(goal.subs).toEqual([{ t: 'Ride 100km', cur: 0, tgt: 100, u: 'km', pct: 0, d: expect.anything() }]);
  });

  it('devices list / revoke from the phone, and unpair from the device', async () => {
    const { token } = await pairDevice(other);

    // `other` has no pairings before this test, so counts are exact.
    const list = await request(app).get('/api/garmin/devices').set('Authorization', `Bearer ${other.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ device_name: 'Edge 1040' });
    const deviceRow = list.body[0];

    // Another user cannot revoke it.
    const foreign = await request(app).delete(`/api/garmin/devices/${deviceRow.id}`).set('Authorization', `Bearer ${user.token}`);
    expect(foreign.status).toBe(404);

    const revoke = await request(app).delete(`/api/garmin/devices/${deviceRow.id}`).set('Authorization', `Bearer ${other.token}`);
    expect(revoke.status).toBe(200);
    const afterRevoke = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${token}`);
    expect(afterRevoke.status).toBe(401);
    const emptyList = await request(app).get('/api/garmin/devices').set('Authorization', `Bearer ${other.token}`);
    expect(emptyList.body).toHaveLength(0);

    // Fresh pairing, then the device unpairs itself.
    const second = await pairDevice(other);
    const unpair = await request(app).delete('/api/garmin/pair').set('Authorization', `Bearer ${second.token}`);
    expect(unpair.status).toBe(200);
    expect(unpair.body).toEqual({ success: true });
    const afterUnpair = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${second.token}`);
    expect(afterUnpair.status).toBe(401);
  });

  it('re-pairing the same device_id supersedes the earlier pairing (one row per computer)', async () => {
    const deviceId = `edge-same-${Date.now()}`;
    const first = await startPairing(deviceId);
    await request(app).post('/api/garmin/pair/confirm').set('Authorization', `Bearer ${user.token}`).send({ code: first.code });
    const firstPoll = await request(app).post('/api/garmin/pair/poll').send({ poll_key: first.poll_key });
    expect(firstPoll.body.status).toBe('ok');

    const second = await startPairing(deviceId);
    await request(app).post('/api/garmin/pair/confirm').set('Authorization', `Bearer ${user.token}`).send({ code: second.code });
    const secondPoll = await request(app).post('/api/garmin/pair/poll').send({ poll_key: second.poll_key });
    expect(secondPoll.body.status).toBe('ok');

    const list = await request(app).get('/api/garmin/devices').set('Authorization', `Bearer ${user.token}`);
    expect(list.body.filter((d) => d.device_id === deviceId)).toHaveLength(1);
    const oldToken = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${firstPoll.body.token}`);
    expect(oldToken.status).toBe(401);
    const newToken = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${secondPoll.body.token}`);
    expect(newToken.status).toBe(200);
  });

  it('a token_version bump (logout-all) also kills device tokens', async () => {
    const { token } = await pairDevice(user);
    await pool.query('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1', [user.id]);
    const res = await request(app).get('/api/garmin/home').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
