// Workout blocks on calendar events (docs/plans/workout-blocks.md), on real
// Postgres: the coach's create_calendar_event / update_calendar_event store
// the session's blocks (migration 1758000000021), GET /api/calendar hands
// them to the clients, and nothing else on the way drops them.
const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

describe('coach workout blocks', () => {
  let app, pool, coach, rider;
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const auth = (req) => req.set('Authorization', `Bearer ${rider.token}`);
  const listEvents = async () => (await auth(request(app).get('/api/calendar')).query({ from: day(-1), to: day(30) })).body;

  // The owner's example: 3×8′ with 4′ recovery, warm-up and cool-down.
  const THREE_BY_EIGHT = [
    { kind: 'warmup', minutes: 15, zone: 2, watts_low: 110, watts_high: 130, cue: 'Easy spin.' },
    {
      repeat: 3,
      steps: [
        { kind: 'work', minutes: 8, zone: 4, watts_low: 240, watts_high: 250, cue: 'Hold the watts to the end.' },
        { kind: 'recovery', minutes: 4, zone: 1, cue: 'Keep the legs turning.' },
      ],
    },
    { kind: 'cooldown', minutes: 10, zone: 1 },
  ];

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    rider = await createUser(pool, app, request);
  }, 30000);

  it('offers workout_steps on both calendar tools, sets included', () => {
    for (const name of ['create_calendar_event', 'update_calendar_event']) {
      const tool = coach.TOOLS.find((t) => t.function.name === name);
      const param = tool.function.parameters.properties.workout_steps;
      expect(param.type).toBe('array');
      expect(Object.keys(param.items.properties)).toEqual(expect.arrayContaining(['kind', 'minutes', 'zone', 'watts_low', 'bpm_high', 'cue', 'repeat', 'steps']));
      expect(param.items.properties.steps.items.properties).not.toHaveProperty('repeat');
    }
  });

  let eventId;

  it('create stores the expanded blocks, takes the duration from them, and returns only a summary to the model', async () => {
    const result = await coach.executeTool(
      'create_calendar_event',
      { type: 'planned_ride', title: '3×8′ @ 240–250 W (≈61′)', description: 'Threshold repeats.', start_date: day(2), duration_minutes: 45, workout_steps: THREE_BY_EIGHT },
      { userId: rider.id }
    );
    expect(result.error).toBeUndefined();
    eventId = result.event.id;
    expect(result.event.workout_summary).toEqual({ minutes: 61, blocks: 8 });
    expect(result.event).not.toHaveProperty('workout');
    // 61 minutes from the blocks, not the 45 passed alongside.
    expect(result.event).toMatchObject({ start_time: '09:00:00', end_time: '10:01:00' });

    // What the app reads — through the contract, with response validation on.
    const res = await auth(request(app).get('/api/calendar')).query({ from: day(-1), to: day(30) });
    expect(res.status).toBe(200);
    const event = res.body.find((e) => e.id === eventId);
    expect(event.workout).toMatchObject({ version: 1, duration_s: 61 * 60 });
    expect(event.workout.steps.map((s) => `${s.kind}:${s.duration_s / 60}${s.rep ? `:${s.rep}/${s.reps}` : ''}`)).toEqual([
      'warmup:15', 'work:8:1/3', 'recovery:4:1/3', 'work:8:2/3', 'recovery:4:2/3', 'work:8:3/3', 'recovery:4:3/3', 'cooldown:10',
    ]);
    expect(event.workout.steps[1]).toMatchObject({ zone: 4, target: { unit: 'w', low: 240, high: 250 }, cue: 'Hold the watts to the end.' });
  });

  it('a list the model got wrong creates nothing and says what to fix', async () => {
    const before = (await listEvents()).length;
    const result = await coach.executeTool(
      'create_calendar_event',
      { type: 'planned_ride', title: 'Broken', start_date: day(3), workout_steps: [{ kind: 'work', minutes: 8 }, { kind: 'work' }] },
      { userId: rider.id }
    );
    expect(result.error).toMatch(/workout_steps\[1\]: minutes must be a number above 0\. Fix workout_steps and call create_calendar_event again\./);
    expect(await listEvents()).toHaveLength(before);
  });

  it('events without blocks work as before; get_calendar says which sessions have them', async () => {
    const rest = await coach.executeTool('create_calendar_event', { type: 'rest_day', title: 'Rest', start_date: day(4), workout_steps: [] }, { userId: rider.id });
    const easy = await coach.executeTool('create_calendar_event', { type: 'planned_ride', title: '90′ easy', start_date: day(5), duration_minutes: 90 }, { userId: rider.id });
    expect(rest.event).not.toHaveProperty('workout_summary');
    expect(easy.event).toMatchObject({ end_time: '10:30:00' });
    expect((await listEvents()).find((e) => e.id === easy.event.id).workout).toBeNull();

    const calendar = await coach.executeTool('get_calendar', { from: day(-1), to: day(30) }, { userId: rider.id });
    const flags = Object.fromEntries(calendar.events.map((e) => [e.id, e.has_workout_blocks]));
    expect(flags).toMatchObject({ [eventId]: true, [rest.event.id]: false, [easy.event.id]: false });
    expect(calendar.events.every((e) => !('workout' in e))).toBe(true);
  });

  it('update replaces the blocks and the duration with them; a bad list changes nothing', async () => {
    const bad = await coach.executeTool('update_calendar_event', { event_id: eventId, title: 'Should not stick', workout_steps: [{ repeat: 99, steps: [{ kind: 'work', minutes: 1 }] }] }, { userId: rider.id });
    expect(bad.error).toMatch(/at most 30\. Fix workout_steps and call update_calendar_event again\./);

    const result = await coach.executeTool(
      'update_calendar_event',
      { event_id: eventId, title: '2×15′ @ 200–210 W (≈60′)', workout_steps: [{ kind: 'warmup', minutes: 15 }, { repeat: 2, steps: [{ kind: 'work', minutes: 15, zone: 3, watts_low: 200, watts_high: 210 }, { kind: 'recovery', minutes: 5 }] }, { kind: 'cooldown', minutes: 5 }] },
      { userId: rider.id }
    );
    expect(result.event).toMatchObject({ title: '2×15′ @ 200–210 W (≈60′)', end_time: '10:00:00', workout_summary: { minutes: 60, blocks: 6 } });
    const event = (await listEvents()).find((e) => e.id === eventId);
    expect(event.workout.steps).toHaveLength(6);
    expect(event.workout.steps[1].target).toEqual({ unit: 'w', low: 200, high: 210 });
  });

  it('the rider editing the event in the app does not lose the blocks; other fields update without touching them', async () => {
    const put = await auth(request(app).put(`/api/calendar/${eventId}`)).send({ title: 'Renamed by the rider', completed: true });
    expect(put.status).toBe(200);
    expect(put.body.workout.steps).toHaveLength(6);

    const moved = await coach.executeTool('update_calendar_event', { event_id: eventId, start_date: day(6) }, { userId: rider.id });
    expect(moved.event.workout_summary).toEqual({ minutes: 60, blocks: 6 });
  });

  it('an empty list removes the blocks', async () => {
    const result = await coach.executeTool('update_calendar_event', { event_id: eventId, type: 'rest_day', workout_steps: [] }, { userId: rider.id });
    expect(result.event).not.toHaveProperty('workout_summary');
    expect((await listEvents()).find((e) => e.id === eventId).workout).toBeNull();
  });
});
