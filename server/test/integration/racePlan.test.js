// Race plans end to end on real Postgres (docs/plans/race-plan.md): the
// rider uploads a route file → the coach's plan_race plans it with their FTP
// and weight → create_calendar_event puts the plan's distance blocks on the
// race day → the Edge downloads them as a FIT workout.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

const M_PER_DEG = 111194.9;
function gpx(legs, name = 'Lefkara Classic') {
  let dist = 0;
  let ele = 100;
  let body = '<trkpt lat="34.7" lon="33"><ele>100</ele></trkpt>';
  for (const [metres, grade] of legs) {
    for (let d = 50; d <= metres; d += 50) {
      dist += 50;
      ele += (50 * grade) / 100;
      body += `<trkpt lat="${34.7 + dist / M_PER_DEG}" lon="33"><ele>${ele}</ele></trkpt>`;
    }
  }
  return Buffer.from(`<?xml version="1.0"?><gpx><trk><name>${name}</name><trkseg>${body}</trkseg></trk></gpx>`);
}

describe('race plans (real Postgres)', () => {
  let app, pool, coach, rider, other;
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const raceDay = day(5);
  const auth = (req, user = rider) => req.set('Authorization', `Bearer ${user.token}`);
  const upload = (buffer, filename = 'lefkara.gpx', user = rider) => auth(request(app).post('/api/race-courses'), user).attach('file', buffer, filename);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    rider = await createUser(pool, app, request);
    other = await createUser(pool, app, request);
    await pool.query(
      `INSERT INTO user_profiles (user_id, weight, ftp_manual, ftp_manual_set_at) VALUES ($1, 72, 250, NOW())
       ON CONFLICT (user_id) DO UPDATE SET weight = 72, ftp_manual = 250, ftp_manual_set_at = NOW()`,
      [rider.id],
    );
  }, 30000);

  it('refuses a request without a session, without a file, or with a file that is not a route', async () => {
    expect((await request(app).post('/api/race-courses').attach('file', gpx([[5000, 0]]), 'a.gpx')).status).toBe(401);
    const none = await auth(request(app).post('/api/race-courses'));
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('BAD_REQUEST');
    const text = await upload(Buffer.from('hello'), 'notes.txt');
    expect(text.status).toBe(400);
    expect(text.body.code).toBe('COURSE_UNREADABLE');
    const short = await upload(gpx([[400, 0]]));
    expect(short.body.code).toBe('COURSE_TOO_SHORT');
  });

  it('file → course → plan → calendar blocks by distance → FIT workout', async () => {
    const res = await upload(gpx([[8000, 0.3], [6000, 5.5], [4000, -4], [10000, 0.5], [5000, 6], [12000, -3]]));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Lefkara Classic', distance_km: 45 });
    expect(res.body.climbs).toHaveLength(2);
    const courseId = res.body.course_id;

    // someone else's course is not theirs to plan
    expect(await coach.executeTool('plan_race', { course_id: courseId }, { userId: other.id })).toMatchObject({ error: 'not_found' });
    // not planned yet → no blocks to put in the calendar
    const early = await coach.executeTool('create_calendar_event', { type: 'planned_ride', title: 'Race', start_date: raceDay, race_course_id: courseId }, { userId: rider.id });
    expect(early.error).toMatch(/has no plan yet/);

    const plan = await coach.executeTool('plan_race', { course_id: courseId, drafting: false, lang: 'en', temp_c: 19 }, { userId: rider.id });
    expect(plan.error).toBeUndefined();
    expect(plan.rider).toMatchObject({ ftp_w: 250, weight_kg: 72 });
    expect(plan.summary.distance_m).toBe(45000);
    expect(plan.summary.duration_s).toBeGreaterThan(3600);
    expect(plan.segments.filter((s) => s.kind === 'climb')).toHaveLength(2);
    expect(plan.fueling.length).toBeGreaterThan(1);

    // time limits: when the plan gets there, and the room left
    const limited = await coach.executeTool(
      'plan_race',
      { course_id: courseId, drafting: false, lang: 'en', temp_c: 19, cutoffs: [{ km: 20, minutes_from_start: 300 }, { km: 45, minutes_from_start: 10 }] },
      { userId: rider.id },
    );
    expect(limited.cutoffs).toHaveLength(2);
    expect(limited.cutoffs[0]).toMatchObject({ km: 20, limit_min: 300, ok: true });
    expect(limited.cutoffs[1]).toMatchObject({ km: 45, eta_min: Math.round(limited.summary.duration_s / 60), ok: false });
    expect(plan.cutoffs).toBeUndefined();

    // the route is remembered for every later turn — no need to attach it again
    const prompt = await coach.buildSystemPrompt(undefined, rider.id);
    expect(prompt).toContain(`- [Route ${courseId}] Lefkara Classic — 45 km`);
    expect(prompt).toContain('planned: ~');
    expect(await coach.buildSystemPrompt(undefined, other.id)).not.toContain(`[Route ${courseId}]`);

    const stored = await pool.query('SELECT plan, plan_options FROM race_courses WHERE id = $1', [courseId]);
    expect(stored.rows[0].plan.steps.length).toBe(plan.blocks);
    expect(stored.rows[0].plan_options).toEqual({ drafting: false, lang: 'en', temp_c: 19 });

    const created = await coach.executeTool(
      'create_calendar_event',
      { type: 'planned_ride', title: 'Lefkara Classic — 45 km', description: 'Race day.', start_date: raceDay, race_course_id: courseId },
      { userId: rider.id },
    );
    expect(created.error).toBeUndefined();
    expect(created.event.workout_summary).toEqual({ minutes: Math.round(plan.summary.duration_s / 60), blocks: plan.blocks });

    const events = (await auth(request(app).get('/api/calendar')).query({ from: day(0), to: day(30) })).body;
    const event = events.find((e) => e.id === created.event.id);
    expect(event.workout.steps).toHaveLength(plan.blocks);
    expect(event.workout.steps.reduce((s, b) => s + b.distance_m, 0)).toBe(45000);
    expect(event.workout.steps[0]).toMatchObject({ kind: 'steady', distance_m: expect.any(Number), target: { unit: 'w' } });

    // A race the model files as a plain event, without the course id, still
    // gets the plan's blocks by its name — and an event already in the
    // calendar takes them through update_calendar_event.
    const byName = await coach.executeTool('create_calendar_event', { type: 'event', title: 'Lefkara Classic 2031 — Demi Route', start_date: day(6) }, { userId: rider.id });
    expect(byName.event.workout_summary.blocks).toBe(plan.blocks);
    const party = await coach.executeTool('create_calendar_event', { type: 'event', title: 'Club dinner', start_date: day(4) }, { userId: rider.id });
    expect(party.event.workout_summary).toBeUndefined();
    const attached = await coach.executeTool('update_calendar_event', { event_id: party.event.id, race_course_id: courseId }, { userId: rider.id });
    expect(attached.error).toBeUndefined();
    const missing = await coach.executeTool('update_calendar_event', { event_id: party.event.id, race_course_id: 999999 }, { userId: rider.id });
    expect(missing.error).toMatch(/not found/);
    const again = (await auth(request(app).get('/api/calendar')).query({ from: day(0), to: day(30) })).body;
    expect(again.find((e) => e.id === party.event.id).workout.steps).toHaveLength(plan.blocks);

    // The bike computer lists a race (an event) once it has blocks.
    const garminSvc = require('../../services/garminWorkouts');
    const week = await garminSvc.buildWeek(rider.id, day(0));
    const listed = week.days.flatMap((d) => d.ev.map((s) => s.id));
    expect(listed).toEqual(expect.arrayContaining([created.event.id, byName.event.id, party.event.id]));

    const garminWorkouts = require('../../services/garminWorkouts');
    const { buffer } = await garminWorkouts.buildSessionFit(rider.id, created.event.id);
    const { Decoder, Stream } = await import('@garmin/fitsdk');
    const { messages, errors } = new Decoder(Stream.fromBuffer(buffer)).read();
    expect(errors).toEqual([]);
    expect(messages.workoutMesgs[0].numValidSteps).toBe(plan.blocks);
    expect(messages.workoutStepMesgs.every((s) => s.durationType === 'distance')).toBe(true);
    expect(messages.workoutStepMesgs.reduce((s, m) => s + m.durationDistance, 0)).toBeCloseTo(45000, 0);
    expect(messages.workoutStepMesgs.some((s) => /^Eat \d+ g carbs and drink/.test(s.notes))).toBe(true);
  });

  it('retention: the newest five per rider, and nothing untouched for sixty days', async () => {
    const raceCoursesRepo = require('../../repositories/raceCourses');
    const keeper = await createUser(pool, app, request);
    const ids = [];
    for (let i = 0; i < 7; i += 1) ids.push((await upload(gpx([[5000, 0]], `Route ${i}`), 'r.gpx', keeper)).body.course_id);
    const left = await pool.query('SELECT id FROM race_courses WHERE user_id = $1 ORDER BY id', [keeper.id]);
    expect(left.rows.map((r) => Number(r.id))).toEqual(ids.slice(2));

    await pool.query("UPDATE race_courses SET updated_at = NOW() - INTERVAL '61 days' WHERE id = $1", [ids[2]]);
    await pool.query("UPDATE race_courses SET updated_at = NOW() - INTERVAL '59 days' WHERE id = $1", [ids[3]]);
    expect(await raceCoursesRepo.deleteOlderThan(60)).toBeGreaterThanOrEqual(1);
    const after = await pool.query('SELECT id FROM race_courses WHERE user_id = $1 ORDER BY id', [keeper.id]);
    expect(after.rows.map((r) => Number(r.id))).toEqual(ids.slice(3));
  });

  it('a course goes with its rider', async () => {
    const res = await upload(gpx([[5000, 0]]), 'flat.gpx', other);
    expect(res.status).toBe(200);
    await pool.query('DELETE FROM users WHERE id = $1', [other.id]);
    expect((await pool.query('SELECT 1 FROM race_courses WHERE id = $1', [res.body.course_id])).rows).toHaveLength(0);
  });
});
