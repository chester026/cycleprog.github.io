import { describe, expect, it } from 'vitest';
import { WorkoutSchema } from '../types/calendar.js';
import { buildWorkout, workoutMinutes, WORKOUT_MAX_REPEAT, WORKOUT_MAX_STEPS } from './workout.js';

const built = (input: unknown) => {
  const result = buildWorkout(input);
  if (!result.ok) throw new Error(result.error);
  return result.workout;
};
const error = (input: unknown) => {
  const result = buildWorkout(input);
  return result.ok ? null : result.error;
};

describe('buildWorkout', () => {
  // The owner's own example (10.11.2026): 3×8′ with 4′ recovery, plus warm-up and cool-down.
  const threeByEight = [
    { kind: 'warmup', minutes: 15, zone: 2, watts_low: 110, watts_high: 130, cue: 'Easy spin, three 20 s pick-ups at the end.' },
    {
      repeat: 3,
      steps: [
        { kind: 'work', minutes: 8, zone: 4, watts_low: 240, watts_high: 250, cadence_low: 85, cadence_high: 95, cue: 'Settle in the first minute, hold the watts to the end.' },
        { kind: 'recovery', minutes: 4, zone: 1, watts_high: 110, cue: 'Keep the legs turning.' },
      ],
    },
    { kind: 'cooldown', minutes: 10, zone: 1 },
  ];

  it('expands a set into flat blocks that know their place in it', () => {
    const workout = built(threeByEight);
    expect(WorkoutSchema.safeParse(workout).success).toBe(true);
    expect(workout.steps.map((s) => s.kind)).toEqual(['warmup', 'work', 'recovery', 'work', 'recovery', 'work', 'recovery', 'cooldown']);
    expect(workout.steps.map((s) => s.duration_s / 60)).toEqual([15, 8, 4, 8, 4, 8, 4, 10]);
    expect(workout.steps.map((s) => (s.rep ? `${s.rep}/${s.reps}` : null))).toEqual([null, '1/3', '1/3', '2/3', '2/3', '3/3', '3/3', null]);
    expect(workout.duration_s).toBe(61 * 60);
    expect(workoutMinutes(workout)).toBe(61);
  });

  it('keeps the target, cadence and cue of each block', () => {
    const [warmup, work, recovery, , , , , cooldown] = built(threeByEight).steps;
    expect(warmup).toEqual({
      kind: 'warmup',
      duration_s: 900,
      zone: 2,
      target: { unit: 'w', low: 110, high: 130 },
      cadence: null,
      cue: 'Easy spin, three 20 s pick-ups at the end.',
      rep: null,
      reps: null,
    });
    expect(work).toMatchObject({ zone: 4, target: { unit: 'w', low: 240, high: 250 }, cadence: { low: 85, high: 95 } });
    // One bound given: it is the target on its own.
    expect(recovery.target).toEqual({ unit: 'w', low: 110, high: 110 });
    expect(cooldown).toMatchObject({ target: null, cadence: null, cue: null });
  });

  it('takes a heart-rate target when there are no watts, and watts when both are given', () => {
    expect(built([{ kind: 'work', minutes: 20, zone: 3, bpm_low: 150, bpm_high: 160 }]).steps[0].target).toEqual({ unit: 'bpm', low: 150, high: 160 });
    expect(built([{ kind: 'work', minutes: 20, zone: 3, bpm_low: 150, watts_low: 200, watts_high: 210 }]).steps[0].target).toEqual({ unit: 'w', low: 200, high: 210 });
  });

  it('fills in what the model left out or got slightly wrong', () => {
    const [noKind, noZone, swapped, clamped, decimals, sprint] = built([
      { minutes: 30 },
      { kind: 'work', minutes: 5 },
      { kind: 'work', minutes: 5, zone: 4, watts_low: 250, watts_high: 240, cadence_low: 95, cadence_high: 85 },
      { kind: 'work', minutes: 1, zone: 12 },
      { kind: 'recovery', minutes: 2.5, zone: 0.4, watts_low: 99.6 },
      { kind: 'work', minutes: 0.25, zone: 7, cue: '   ' },
    ]).steps;
    expect(noKind).toMatchObject({ kind: 'steady', zone: 2 });
    expect(noZone.zone).toBe(4);
    expect(swapped).toMatchObject({ target: { low: 240, high: 250 }, cadence: { low: 85, high: 95 } });
    expect(clamped.zone).toBe(7);
    expect(decimals).toMatchObject({ duration_s: 150, zone: 1, target: { low: 100, high: 100 } });
    expect(sprint).toMatchObject({ duration_s: 15, cue: null });
  });

  it('default zones follow the kind of block', () => {
    const zones = built(['warmup', 'work', 'recovery', 'cooldown', 'steady', 'tempo'].map((kind) => ({ kind, minutes: 5 }))).steps.map((s) => s.zone);
    expect(zones).toEqual([2, 4, 1, 1, 2, 2]);
  });

  it('a set without a usable repeat, or repeated once, is just its blocks', () => {
    const plain = built([{ steps: [{ kind: 'work', minutes: 5 }, { kind: 'recovery', minutes: 5 }] }, { repeat: 1, steps: [{ kind: 'work', minutes: 3 }] }]);
    expect(plain.steps).toHaveLength(3);
    expect(plain.steps.every((s) => s.rep === null && s.reps === null)).toBe(true);
    expect(built([{ repeat: 2.4, steps: [{ kind: 'work', minutes: 1 }] }]).steps.map((s) => s.rep)).toEqual([1, 2]);
  });

  it('trims a cue and caps its length', () => {
    const cue = built([{ kind: 'work', minutes: 5, cue: `  ${'x'.repeat(400)}  ` }]).steps[0].cue as string;
    expect(cue).toHaveLength(240);
  });

  it('says what is wrong instead of guessing', () => {
    expect(error(undefined)).toMatch(/non-empty list/);
    expect(error([])).toMatch(/non-empty list/);
    expect(error('3x8')).toMatch(/non-empty list/);
    expect(error(['3x8'])).toBe('workout_steps[0] must be an object');
    expect(error([{ kind: 'work' }])).toBe('workout_steps[0]: minutes must be a number above 0');
    expect(error([{ kind: 'work', minutes: -5 }])).toMatch(/minutes must be a number above 0/);
    expect(error([{ kind: 'work', minutes: '8' }])).toMatch(/minutes must be a number above 0/);
    expect(error([{ kind: 'work', minutes: 0.05 }])).toBe('workout_steps[0]: a block must be at least 5 seconds');
    expect(error([{ repeat: 3, steps: [] }])).toBe('workout_steps[0].steps must be a non-empty list of blocks');
    expect(error([{ repeat: 3, steps: 'work' }])).toMatch(/steps must be a non-empty list/);
    expect(error([{ kind: 'warmup', minutes: 10 }, { repeat: 3, steps: [null] }])).toBe('workout_steps[1].steps[0] must be an object');
    expect(error([{ repeat: 2, steps: [{ kind: 'work', minutes: 0 }] }])).toBe('workout_steps[0].steps[0]: minutes must be a number above 0');
    expect(error([{ repeat: 2, steps: [{ repeat: 2, steps: [{ kind: 'work', minutes: 1 }] }] }])).toMatch(/a set cannot contain another set/);
    expect(error([{ repeat: WORKOUT_MAX_REPEAT + 1, steps: [{ kind: 'work', minutes: 1 }] }])).toMatch(/at most 30/);
  });

  it('refuses a workout too long or too finely chopped to be one', () => {
    // 480 "minutes" that were meant as seconds.
    expect(error([{ kind: 'work', minutes: 480 }, { kind: 'work', minutes: 480 }])).toMatch(/add up to 960 minutes/);
    const many = Array.from({ length: WORKOUT_MAX_STEPS + 1 }, () => ({ kind: 'work', minutes: 1 }));
    expect(error(many)).toMatch(/more than 60 blocks/);
    expect(error([{ repeat: 30, steps: [{ kind: 'work', minutes: 0.5 }, { kind: 'recovery', minutes: 0.5 }, { kind: 'steady', minutes: 0.5 }] }])).toMatch(/more than 60 blocks/);
    expect(built(many.slice(0, WORKOUT_MAX_STEPS)).steps).toHaveLength(WORKOUT_MAX_STEPS);
  });

  it('a workout of a few seconds still counts as a minute', () => {
    expect(workoutMinutes(built([{ kind: 'work', minutes: 0.2 }]))).toBe(1);
  });
});
