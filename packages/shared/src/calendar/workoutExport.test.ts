import { describe, expect, it } from 'vitest';
import { buildWorkout } from './workout.js';
import { toDeviceSteps } from './workoutExport.js';
import type { Workout, WorkoutStep } from '../types/calendar.js';

const built = (input: unknown): Workout => {
  const result = buildWorkout(input);
  if (!result.ok) throw new Error(result.error);
  return result.workout;
};

const step = (overrides: Partial<WorkoutStep> = {}): WorkoutStep => ({
  kind: 'work',
  duration_s: 480,
  zone: 4,
  target: { unit: 'w', low: 240, high: 250 },
  cadence: null,
  cue: null,
  rep: null,
  reps: null,
  ...overrides,
});

describe('toDeviceSteps', () => {
  it('folds a set back into one repeat: 3×8′ with 4′ recovery is warm-up, a repeat of two steps, cool-down', () => {
    const workout = built([
      { kind: 'warmup', minutes: 15, zone: 2, cue: 'Easy spin.' },
      {
        repeat: 3,
        steps: [
          { kind: 'work', minutes: 8, zone: 4, watts_low: 240, watts_high: 250, cadence_low: 85, cadence_high: 95, cue: 'Hold it.' },
          { kind: 'recovery', minutes: 4, zone: 1 },
        ],
      },
      { kind: 'cooldown', minutes: 10 },
    ]);
    expect(workout.steps).toHaveLength(8);

    expect(toDeviceSteps(workout)).toEqual([
      { type: 'step', kind: 'warmup', duration_s: 900, zone: 2, target: null, cadence: null, cue: 'Easy spin.' },
      {
        type: 'repeat',
        times: 3,
        steps: [
          { type: 'step', kind: 'work', duration_s: 480, zone: 4, target: { unit: 'w', low: 240, high: 250 }, cadence: { low: 85, high: 95 }, cue: 'Hold it.' },
          { type: 'step', kind: 'recovery', duration_s: 240, zone: 1, target: null, cadence: null, cue: null },
        ],
      },
      { type: 'step', kind: 'cooldown', duration_s: 600, zone: 1, target: null, cadence: null, cue: null },
    ]);
  });

  it('keeps two sets that follow each other apart, and a one-block set is a repeat of one step', () => {
    const workout = built([
      { repeat: 2, steps: [{ kind: 'work', minutes: 1, zone: 6 }] },
      { repeat: 2, steps: [{ kind: 'work', minutes: 5, zone: 4 }, { kind: 'recovery', minutes: 2 }] },
    ]);
    const items = toDeviceSteps(workout);
    expect(items.map(item => (item.type === 'repeat' ? [item.times, item.steps.length] : 'step'))).toEqual([
      [2, 1],
      [2, 2],
    ]);
  });

  it('a workout without sets is its blocks, one to one', () => {
    const workout = built([{ kind: 'warmup', minutes: 10 }, { kind: 'steady', minutes: 115, zone: 2 }, { kind: 'cooldown', minutes: 10 }]);
    expect(toDeviceSteps(workout).map(item => item.type)).toEqual(['step', 'step', 'step']);
  });

  it('leaves a set flat when its repetitions are not the same blocks or it is cut short', () => {
    const effort = (rep: number, overrides: Partial<WorkoutStep> = {}) => step({ rep, reps: 3, ...overrides });
    const flat = (steps: WorkoutStep[]) => toDeviceSteps({ steps }).map(item => item.type);

    // The second repetition is longer.
    expect(flat([effort(1), effort(2, { duration_s: 600 }), effort(3)])).toEqual(['step', 'step', 'step']);
    // A different target, the same numbers in another unit, a different cadence, a different cue.
    expect(flat([effort(1), effort(2, { target: { unit: 'w', low: 250, high: 260 } }), effort(3)])).toEqual(['step', 'step', 'step']);
    expect(flat([effort(1), effort(2, { target: { unit: 'bpm', low: 240, high: 250 } }), effort(3)])).toEqual(['step', 'step', 'step']);
    expect(flat([effort(1), effort(2, { target: null }), effort(3)])).toEqual(['step', 'step', 'step']);
    expect(flat([effort(1), effort(2, { cadence: { low: 90, high: 100 } }), effort(3)])).toEqual(['step', 'step', 'step']);
    expect(flat([effort(1), effort(2, { cue: 'Now harder.' }), effort(3)])).toEqual(['step', 'step', 'step']);
    // The third repetition is missing; the numbering is off.
    expect(flat([effort(1), effort(2)])).toEqual(['step', 'step']);
    expect(flat([effort(1), effort(3), effort(2)])).toEqual(['step', 'step', 'step']);
    expect(flat([effort(1), effort(2, { reps: 2 }), effort(3)])).toEqual(['step', 'step', 'step']);
    // A block that claims to be "2 of 3" with nothing before it, or "1 of 1".
    expect(flat([effort(2), effort(3)])).toEqual(['step', 'step']);
    expect(flat([step({ rep: 1, reps: 1 })])).toEqual(['step']);
  });

  it('untargeted blocks with the same cadence still fold', () => {
    const block = (rep: number) => step({ rep, reps: 2, target: null, cadence: { low: 85, high: 95 } });
    expect(toDeviceSteps({ steps: [block(1), block(2)] })).toEqual([
      { type: 'repeat', times: 2, steps: [{ type: 'step', kind: 'work', duration_s: 480, zone: 4, target: null, cadence: { low: 85, high: 95 }, cue: null }] },
    ]);
  });

  it('a block that ends after a distance keeps the distance; time blocks carry none', () => {
    const [byDistance, byTime] = toDeviceSteps({ steps: [step({ distance_m: 6100, duration_s: 1680 }), step({ distance_m: null })] });
    expect(byDistance).toMatchObject({ type: 'step', duration_s: 1680, distance_m: 6100 });
    expect(byTime).not.toHaveProperty('distance_m');
    // the same watts over different distances are not one set
    const block = (rep: number, distance_m: number) => step({ rep, reps: 2, distance_m });
    expect(toDeviceSteps({ steps: [block(1, 1000), block(2, 2000)] }).map((i) => i.type)).toEqual(['step', 'step']);
    expect(toDeviceSteps({ steps: [block(1, 1000), block(2, 1000)] }).map((i) => i.type)).toEqual(['repeat']);
  });
});
