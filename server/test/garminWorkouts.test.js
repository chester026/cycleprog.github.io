// The week / session payloads and the FIT workout file for the bike
// computer (docs/plans/garmin-edge-workouts.md) — the pure parts: the
// mappers the Monkey C app reads (services/garminWorkouts.js) and the file
// the Edge's workout player runs (services/garminWorkoutFit.js). No DB.
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.PGHOST = process.env.PGHOST || 'localhost';

const { mapWeek, mapSession, deviceText, versionOf, workoutName, MAX_SESSIONS, CUE_MAX } = require('../services/garminWorkouts');
const { encodeWorkoutFit, workoutStepMessages, stepNotes, NOTES_MAX } = require('../services/garminWorkoutFit');
const { GarminWeekResponseSchema, GarminSessionResponseSchema } = require('@bikelab/shared/api');
const { buildWorkout } = require('@bikelab/shared/calendar');

const workoutOf = (steps) => {
  const built = buildWorkout(steps);
  if (!built.ok) throw new Error(built.error);
  return built.workout;
};

// The owner's example: 3×8′ with 4′ recovery, warm-up and cool-down.
const THREE_BY_EIGHT = workoutOf([
  { kind: 'warmup', minutes: 15, zone: 2, cue: 'Easy spin.' },
  {
    repeat: 3,
    steps: [
      { kind: 'work', minutes: 8, zone: 4, watts_low: 240, watts_high: 250, cadence_low: 85, cadence_high: 95, cue: 'Hold the watts to the end.' },
      { kind: 'recovery', minutes: 4, zone: 1, bpm_low: 110, bpm_high: 120 },
    ],
  },
  { kind: 'cooldown', minutes: 10 },
]);

const event = (over = {}) => ({
  id: 812,
  type: 'planned_ride',
  title: '3×8′ @ 240–250 W',
  start_date: '2026-11-11',
  start_time: null,
  end_time: null,
  completed: false,
  updated_at: '2026-11-10T10:00:00.000Z',
  workout: THREE_BY_EIGHT,
  ...over,
});

describe('garmin week / session payloads', () => {
  it('week: days in order with their sessions, the profile as [seconds, zone, effort]', () => {
    const out = mapWeek(
      [event(), event({ id: 813, title: 'Evening spin', workout: null, start_time: '18:00', end_time: '18:45', completed: true }), event({ id: 814, start_date: '2026-11-13' })],
      '2026-11-10'
    );
    expect(GarminWeekResponseSchema.safeParse(out).success).toBe(true);
    expect(out.from).toBe('2026-11-10');
    expect(out.days.map((day) => [day.d, day.ev.map((s) => s.id)])).toEqual([
      ['2026-11-11', [812, 813]],
      ['2026-11-13', [814]],
    ]);

    const [blocks, plain] = out.days[0].ev;
    expect(blocks).toMatchObject({ t: "3×8' @ 240-250 W", min: 61, done: false });
    expect(blocks.b).toEqual([
      [900, 2, 0],
      [480, 4, 1],
      [240, 1, 0],
      [480, 4, 1],
      [240, 1, 0],
      [480, 4, 1],
      [240, 1, 0],
      [600, 1, 0],
    ]);
    // A session without blocks: its length from the coach's start/end times, nothing to draw.
    expect(plain).toMatchObject({ t: 'Evening spin', min: 45, done: true, b: [] });
    expect(mapWeek([event({ workout: null })], '2026-11-10').days[0].ev[0].min).toBe(0);
  });

  it('week: capped, and an empty week is an empty list', () => {
    const many = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => event({ id: 900 + i }));
    expect(mapWeek(many, '2026-11-10').days[0].ev).toHaveLength(MAX_SESSIONS);
    expect(mapWeek([], '2026-11-10')).toEqual({ v: 1, from: '2026-11-10', days: [] });
  });

  it('session: eleven positional values per block and never a null', () => {
    const out = mapSession(event());
    expect(GarminSessionResponseSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ v: 1, id: 812, d: '2026-11-11', min: 61, done: false });
    // seconds, zone, kind, rep, reps, unit, low, high, cadence low, cadence high, cue
    expect(out.b[0]).toEqual([900, 2, 0, 0, 0, 0, 0, 0, 0, 0, 'Easy spin.']);
    expect(out.b[1]).toEqual([480, 4, 1, 1, 3, 1, 240, 250, 85, 95, 'Hold the watts to the end.']);
    expect(out.b[2]).toEqual([240, 1, 2, 1, 3, 2, 110, 120, 0, 0, '']);
    expect(out.b[7]).toEqual([600, 1, 3, 0, 0, 0, 0, 0, 0, 0, '']);
    expect(out.b.flat().every((value) => value !== null && value !== undefined)).toBe(true);
  });

  it('session: long text is trimmed for the device, typographic marks become ones an Edge can draw', () => {
    const long = workoutOf([{ kind: 'steady', minutes: 60, cue: `Ровно и спокойно – ${'очень '.repeat(60)}` }]);
    const out = mapSession(event({ title: `Длинная восстановительная “прогулка” — ${'x'.repeat(60)}`, workout: long }));
    expect(out.t.length).toBeLessThanOrEqual(40);
    expect(out.t.startsWith('Длинная восстановительная "прогулка"')).toBe(true);
    expect(out.b[0][10].length).toBeLessThanOrEqual(CUE_MAX);
    expect(out.b[0][10].startsWith('Ровно и спокойно - ')).toBe(true);
    expect(deviceText('8′ @ 240–250 W…  ok')).toBe("8' @ 240-250 W... ok");
    expect(deviceText(null)).toBe('');
  });

  it('the workout is named by its day and headline, short enough for the device list', () => {
    expect(workoutName(event())).toBe("11.11 3×8' @ 240-250 W");
    expect(workoutName(event({ start_date: '2026-03-05', title: 'Endurance' }))).toBe('05.03 Endurance');
    const long = workoutName(event({ title: 'x'.repeat(90) }));
    expect(long).toHaveLength(40);
    expect(long.startsWith('11.11 xxx')).toBe(true);
  });

  it('the version follows the title and the blocks, nothing else', () => {
    const base = versionOf(event());
    expect(base).toMatch(/^[0-9a-f]{8}$/);
    expect(versionOf(event({ completed: true, updated_at: '2030-01-01T00:00:00Z' }))).toBe(base);
    expect(versionOf(event({ title: 'Other' }))).not.toBe(base);
    expect(versionOf(event({ workout: workoutOf([{ kind: 'steady', minutes: 30 }]) }))).not.toBe(base);
    expect(versionOf(event({ workout: null }))).not.toBe(base);
  });
});

describe('garmin FIT workout file', () => {
  it('step messages: a set is its steps once and a repeat pointing back at the first', () => {
    const steps = workoutStepMessages(THREE_BY_EIGHT);
    expect(steps.map((s) => s.messageIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(steps[0]).toEqual({ messageIndex: 0, durationType: 'time', durationValue: 900000, intensity: 'warmup', targetType: 'open', notes: 'Easy spin.' });
    // Watts are stored +1000, bpm +100; the cadence rides along in the note.
    expect(steps[1]).toEqual({
      messageIndex: 1,
      durationType: 'time',
      durationValue: 480000,
      intensity: 'active',
      targetType: 'power',
      targetValue: 0,
      customTargetValueLow: 1240,
      customTargetValueHigh: 1250,
      notes: '85-95 rpm · Hold the watts to the end.',
    });
    expect(steps[2]).toMatchObject({ intensity: 'recovery', targetType: 'heartRate', customTargetValueLow: 210, customTargetValueHigh: 220 });
    expect(steps[2]).not.toHaveProperty('notes');
    expect(steps[3]).toEqual({ messageIndex: 3, durationType: 'repeatUntilStepsCmplt', durationValue: 1, targetType: 'open', targetValue: 3 });
    expect(steps[4]).toMatchObject({ messageIndex: 4, intensity: 'cooldown', durationValue: 600000 });
  });

  it('notes: one cadence value, cadence alone, and a long cue cut to the limit', () => {
    expect(stepNotes({ cadence: { low: 90, high: 90 }, cue: 'Spin.' })).toBe('90 rpm · Spin.');
    expect(stepNotes({ cadence: { low: 85, high: 95 }, cue: null })).toBe('85-95 rpm');
    expect(stepNotes({ cadence: null, cue: null })).toBeNull();
    expect(stepNotes({ cadence: null, cue: 'a'.repeat(400) })).toHaveLength(NOTES_MAX);
  });

  it('the file reads back through the SDK as the same workout', async () => {
    const buffer = await encodeWorkoutFit({ id: 812, name: "3×8' @ 240-250 W", workout: THREE_BY_EIGHT, createdAt: new Date('2026-11-10T10:00:00.000Z') });
    const { Decoder, Stream } = await import('@garmin/fitsdk');
    const decoder = new Decoder(Stream.fromBuffer(buffer));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);

    expect(messages.fileIdMesgs[0]).toMatchObject({ type: 'workout', serialNumber: 812 });
    expect(messages.workoutMesgs[0]).toEqual({ sport: 'cycling', numValidSteps: 5, wktName: "3×8' @ 240-250 W" });
    const steps = messages.workoutStepMesgs;
    expect(steps).toHaveLength(5);
    // The decoder expands the raw values into what a device understands.
    expect(steps[0]).toMatchObject({ durationType: 'time', durationTime: 900, intensity: 'warmup', targetType: 'open', notes: 'Easy spin.' });
    expect(steps[1]).toMatchObject({ durationTime: 480, targetType: 'power', targetPowerZone: 0, customTargetPowerLow: 1240, customTargetPowerHigh: 1250 });
    expect(steps[2]).toMatchObject({ durationTime: 240, targetType: 'heartRate', customTargetHeartRateLow: 210, customTargetHeartRateHigh: 220 });
    expect(steps[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 3 });
    expect(steps[4]).toMatchObject({ durationTime: 600, intensity: 'cooldown' });
    // Ridden out: 15 + 3 × (8 + 4) + 10 minutes.
    const ridden = steps[0].durationTime + steps[3].repeatSteps * (steps[1].durationTime + steps[2].durationTime) + steps[4].durationTime;
    expect(ridden).toBe(THREE_BY_EIGHT.duration_s);
  });

  it('a long name is cut, a missing one has a fallback, steady riding is an active step', async () => {
    const workout = workoutOf([{ kind: 'steady', minutes: 90, zone: 2, watts_low: 150, watts_high: 150 }]);
    expect(workoutStepMessages(workout)[0]).toMatchObject({ intensity: 'active', customTargetValueLow: 1150, customTargetValueHigh: 1150 });
    const { Decoder, Stream } = await import('@garmin/fitsdk');
    const nameOf = async (name) => new Decoder(Stream.fromBuffer(await encodeWorkoutFit({ id: 1, name, workout }))).read().messages.workoutMesgs[0].wktName;
    expect(await nameOf('n'.repeat(90))).toHaveLength(40);
    expect(await nameOf('')).toBe('BikeLab');
  });
});
