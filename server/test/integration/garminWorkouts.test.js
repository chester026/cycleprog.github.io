// The week on the bike computer (docs/plans/garmin-edge-workouts.md), on
// real Postgres: a paired device reads the rider's planned sessions, one
// session's blocks and its FIT workout file — and only that rider's, and
// only with a device token.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { buildWorkout } = require('@bikelab/shared/calendar');
const { GarminWeekResponseSchema, GarminSessionResponseSchema } = require('@bikelab/shared/api');

describe('garmin week, session and workout file', () => {
  let app, pool, rider, other, deviceToken, otherDeviceToken;
  const FROM = '2031-03-10';
  const ids = {};

  const { workout: THREE_BY_EIGHT } = buildWorkout([
    { kind: 'warmup', minutes: 15, zone: 2, cue: 'Easy spin.' },
    {
      repeat: 3,
      steps: [
        { kind: 'work', minutes: 8, zone: 4, watts_low: 240, watts_high: 250, cue: 'Hold the watts – to the end.' },
        { kind: 'recovery', minutes: 4, zone: 1 },
      ],
    },
    { kind: 'cooldown', minutes: 10 },
  ]);

  async function pairDevice(user) {
    const start = await request(app)
      .post('/api/garmin/pair/start')
      .send({ device_id: `edge-${Date.now()}-${Math.random().toString(36).slice(2)}`, device_name: 'Edge 1040' });
    expect(start.status).toBe(200);
    const confirm = await request(app).post('/api/garmin/pair/confirm').set('Authorization', `Bearer ${user.token}`).send({ code: start.body.code });
    expect(confirm.status).toBe(200);
    const poll = await request(app).post('/api/garmin/pair/poll').send({ poll_key: start.body.poll_key });
    expect(poll.body.status).toBe('ok');
    return poll.body.token;
  }

  async function addEvent(user, { title, date, type = 'planned_ride', workout = null, start_time = null, end_time = null, completed = false }) {
    const res = await pool.query(
      `INSERT INTO calendar_events (user_id, type, title, start_date, start_time, end_time, completed, source, workout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'coach', $8) RETURNING id`,
      [user.id, type, title, date, start_time, end_time, completed, workout ? JSON.stringify(workout) : null]
    );
    return Number(res.rows[0].id);
  }

  const device = (req, token = deviceToken) => req.set('Authorization', `Bearer ${token}`);
  // supertest hands a binary body over as a Buffer only when asked to.
  const binary = (res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    rider = await createUser(pool, app, request);
    other = await createUser(pool, app, request);
    deviceToken = await pairDevice(rider);
    otherDeviceToken = await pairDevice(other);

    ids.blocks = await addEvent(rider, { title: '3×8′ @ 240–250 W', date: '2031-03-11', workout: THREE_BY_EIGHT });
    ids.plain = await addEvent(rider, { title: 'Evening spin', date: '2031-03-11', start_time: '18:00', end_time: '18:45', completed: true });
    ids.lastDay = await addEvent(rider, { title: 'Sunday long', date: '2031-03-16', workout: THREE_BY_EIGHT });
    // Outside the picture: the day before, the eighth day, a rest day, another rider's session.
    await addEvent(rider, { title: 'Yesterday', date: '2031-03-09', workout: THREE_BY_EIGHT });
    await addEvent(rider, { title: 'Next Monday', date: '2031-03-17', workout: THREE_BY_EIGHT });
    await addEvent(rider, { title: 'Rest', date: '2031-03-12', type: 'rest_day' });
    ids.foreign = await addEvent(other, { title: 'Not yours', date: '2031-03-11', workout: THREE_BY_EIGHT });
  }, 30000);

  it('week: the planned rides of seven days from `from`, with their profiles', async () => {
    const res = await device(request(app).get('/api/garmin/week')).query({ from: FROM });
    expect(res.status).toBe(200);
    expect(GarminWeekResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.from).toBe(FROM);
    expect(res.body.days.map((day) => [day.d, day.ev.map((s) => s.id).sort((a, b) => a - b)])).toEqual([
      ['2031-03-11', [ids.blocks, ids.plain].sort((a, b) => a - b)],
      ['2031-03-16', [ids.lastDay]],
    ]);
    const session = res.body.days[0].ev.find((s) => s.id === ids.blocks);
    expect(session).toMatchObject({ t: "3×8' @ 240-250 W", min: 61, done: false });
    expect(session.b).toHaveLength(8);
    expect(session.b[1]).toEqual([480, 4, 1]);
    expect(res.body.days[0].ev.find((s) => s.id === ids.plain)).toMatchObject({ min: 45, done: true, b: [] });
  });

  it('week: `from` is required and must be a date', async () => {
    expect((await device(request(app).get('/api/garmin/week'))).status).toBe(400);
    expect((await device(request(app).get('/api/garmin/week')).query({ from: 'tomorrow' })).status).toBe(400);
    expect((await device(request(app).get('/api/garmin/week')).query({ from: '2031-02-31' })).status).toBe(400);
  });

  it('session: the blocks in full; the version is the one the week gave', async () => {
    const week = await device(request(app).get('/api/garmin/week')).query({ from: FROM });
    const res = await device(request(app).get(`/api/garmin/sessions/${ids.blocks}`));
    expect(res.status).toBe(200);
    expect(GarminSessionResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ id: ids.blocks, d: '2031-03-11', min: 61 });
    expect(res.body.u).toBe(week.body.days[0].ev.find((s) => s.id === ids.blocks).u);
    expect(res.body.b[1]).toEqual([480, 4, 1, 1, 3, 1, 240, 250, 0, 0, 'Hold the watts - to the end.']);

    const plain = await device(request(app).get(`/api/garmin/sessions/${ids.plain}`));
    expect(plain.body).toMatchObject({ id: ids.plain, min: 45, done: true, b: [] });
  });

  it('workout file: a FIT workout the SDK reads back as the same session', async () => {
    const res = await device(request(app).get(`/api/garmin/sessions/${ids.blocks}/fit`)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain(`bikelab-${ids.blocks}.fit`);

    const { Decoder, Stream } = await import('@garmin/fitsdk');
    const decoder = new Decoder(Stream.fromBuffer(res.body));
    expect(decoder.isFIT()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);
    expect(messages.fileIdMesgs[0]).toMatchObject({ type: 'workout', serialNumber: ids.blocks });
    expect(messages.workoutMesgs[0]).toMatchObject({ sport: 'cycling', numValidSteps: 5, wktName: "11.03 3×8' @ 240-250 W" });
    expect(messages.workoutStepMesgs[1]).toMatchObject({ durationTime: 480, customTargetPowerLow: 1240, customTargetPowerHigh: 1250, notes: 'Hold the watts - to the end.' });
    expect(messages.workoutStepMesgs[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 3 });
  });

  it('workout file: a session without blocks cannot be started', async () => {
    const res = await device(request(app).get(`/api/garmin/sessions/${ids.plain}/fit`));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GARMIN_SESSION_NO_BLOCKS');
  });

  it('another rider\'s session, a missing one and a non-id are all "not found"', async () => {
    for (const path of [`/api/garmin/sessions/${ids.foreign}`, `/api/garmin/sessions/${ids.foreign}/fit`, '/api/garmin/sessions/99999999', '/api/garmin/sessions/99999999/fit', '/api/garmin/sessions/abc/fit']) {
      const res = await device(request(app).get(path));
      expect([path, res.status]).toEqual([path, 404]);
    }
    // …and that rider's own device does see it.
    expect((await device(request(app).get(`/api/garmin/sessions/${ids.foreign}`), otherDeviceToken)).status).toBe(200);
    const week = await device(request(app).get('/api/garmin/week'), otherDeviceToken).query({ from: FROM });
    expect(week.body.days.flatMap((day) => day.ev.map((s) => s.id))).toEqual([ids.foreign]);
  });

  it('a session token is not a device token here, and no token is a 401', async () => {
    for (const path of [`/api/garmin/week?from=${FROM}`, `/api/garmin/sessions/${ids.blocks}`, `/api/garmin/sessions/${ids.blocks}/fit`]) {
      expect((await request(app).get(path).set('Authorization', `Bearer ${rider.token}`)).status).toBe(401);
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
});
