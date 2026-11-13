import type {WorkoutStep} from '@bikelab/shared/types';
import {
  blockColor,
  blockHeightFraction,
  blockStartOffsets,
  formatBlockCadence,
  formatBlockDuration,
  formatBlockName,
  formatBlockTarget,
  formatWorkoutClock,
  isEffortBlock,
  MIN_BLOCK_HEIGHT, formatBlockLength} from './workoutLib';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${Object.values(options).join('/')}` : key;

const step = (overrides: Partial<WorkoutStep> = {}): WorkoutStep => ({
  kind: 'work',
  duration_s: 480,
  zone: 4,
  target: {unit: 'w', low: 240, high: 250},
  cadence: null,
  cue: null,
  rep: null,
  reps: null,
  ...overrides,
});

describe('workout block helpers', () => {
  it('height grows with the zone, from the minimum to the full height', () => {
    expect(blockHeightFraction(1)).toBe(MIN_BLOCK_HEIGHT);
    expect(blockHeightFraction(7)).toBe(1);
    expect(blockHeightFraction(4)).toBeCloseTo(0.7);
    const heights = [1, 2, 3, 4, 5, 6, 7].map(blockHeightFraction);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    // Out-of-range zones are clamped, not drawn off the chart.
    expect(blockHeightFraction(0)).toBe(MIN_BLOCK_HEIGHT);
    expect(blockHeightFraction(12)).toBe(1);
  });

  it('only efforts and steady riding carry their zone colour; the frame around them is neutral', () => {
    const zones = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'];
    expect(['warmup', 'work', 'recovery', 'cooldown', 'steady'].map(kind => isEffortBlock({kind} as WorkoutStep))).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
    expect(blockColor(step({kind: 'work', zone: 4}), zones)).toBe('z4');
    expect(blockColor(step({kind: 'steady', zone: 2}), zones)).toBe('z2');
    // A warm-up in zone 2 or a recovery in zone 3 is still part of the frame.
    expect(blockColor(step({kind: 'warmup', zone: 2}), zones)).toBe('z1');
    expect(blockColor(step({kind: 'recovery', zone: 3}), zones)).toBe('z1');
    expect(blockColor(step({kind: 'cooldown', zone: 1}), zones)).toBe('z1');
    // Out-of-range zones are clamped to the palette.
    expect(blockColor(step({kind: 'work', zone: 0}), zones)).toBe('z1');
    expect(blockColor(step({kind: 'work', zone: 12}), zones)).toBe('z7');
  });

  it('each block starts where the previous ones end', () => {
    expect(blockStartOffsets([step({duration_s: 900}), step(), step({duration_s: 240}), step()])).toEqual([0, 900, 1380, 1620]);
    expect(blockStartOffsets([])).toEqual([]);
  });

  it('formats elapsed time as a clock', () => {
    expect(formatWorkoutClock(0)).toBe('0:00');
    expect(formatWorkoutClock(1620)).toBe('27:00');
    expect(formatWorkoutClock(3900)).toBe('1:05:00');
    expect(formatWorkoutClock(-5)).toBe('0:00');
  });

  it('formats a block length in the largest sensible units', () => {
    expect(formatBlockDuration(30, t)).toBe('30 calendar.workout.sec');
    expect(formatBlockDuration(480, t)).toBe('8 common.min');
    expect(formatBlockDuration(150, t)).toBe('2 common.min 30 calendar.workout.sec');
    expect(formatBlockDuration(4500, t)).toBe('1 common.h 15 common.min');
    expect(formatBlockDuration(7200, t)).toBe('2 common.h');
  });

  it('formats the target and the cadence, as a range or a single value', () => {
    expect(formatBlockTarget({unit: 'w', low: 240, high: 250}, t)).toBe('240–250 common.watts');
    expect(formatBlockTarget({unit: 'w', low: 110, high: 110}, t)).toBe('110 common.watts');
    expect(formatBlockTarget({unit: 'bpm', low: 150, high: 160}, t)).toBe('150–160 common.bpm');
    expect(formatBlockTarget(null, t)).toBeNull();
    expect(formatBlockCadence({low: 85, high: 95}, t)).toBe('85–95 common.rpm');
    expect(formatBlockCadence({low: 90, high: 90}, t)).toBe('90 common.rpm');
    expect(formatBlockCadence(null, t)).toBeNull();
  });

  it('names a block by its kind, with its place in a set', () => {
    expect(formatBlockName(step({kind: 'warmup'}), t)).toBe('calendar.workout.kinds.warmup');
    expect(formatBlockName(step({rep: 2, reps: 3}), t)).toBe('calendar.workout.kinds.work calendar.workout.repOf:2/3');
  });
});

describe('formatBlockLength', () => {
  const tr = (key: string) => key;

  it('a distance block reads as its distance with the estimated time; a time block as its duration', () => {
    expect(formatBlockLength({duration_s: 1680, distance_m: 6100}, tr)).toBe('6.1 common.km · ≈28 common.min');
    expect(formatBlockLength({duration_s: 1800, distance_m: 15000}, tr)).toBe('15 common.km · ≈30 common.min');
    expect(formatBlockLength({duration_s: 480, distance_m: null}, tr)).toBe('8 common.min');
    expect(formatBlockLength({duration_s: 480}, tr)).toBe('8 common.min');
  });
});
