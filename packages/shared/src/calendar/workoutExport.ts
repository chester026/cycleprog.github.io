/**
 * The stored workout → the shape a head unit's workout player takes
 * (docs/plans/garmin-edge-workouts.md).
 *
 * A stored `Workout` is flat: "3×8′, 4′ recovery" is six blocks, each
 * knowing its place in the set (`rep` / `reps`). A device wants the opposite
 * — the two blocks once and "repeat 3 times" — so its lap counter reads
 * "2 / 3" and the rider can skip a repetition. `toDeviceSteps` folds the
 * sets back; it is the one place that does, for the FIT workout file the
 * Edge downloads and for any later export (Garmin's Training API, `.zwo`).
 *
 * A set is folded only when every repetition is the same blocks. Anything
 * else — a stored list edited by hand, a set cut short — comes out as plain
 * steps: a longer list on the device, never a wrong one.
 */
import type { Workout, WorkoutStep, WorkoutStepKind, WorkoutTarget } from '../types/calendar.js';

export interface DeviceStep {
  type: 'step';
  kind: WorkoutStepKind;
  duration_s: number;
  /** Set on a block that ends after a distance (metres); `duration_s` is then an estimate. */
  distance_m?: number;
  zone: number;
  target: WorkoutTarget | null;
  cadence: { low: number; high: number } | null;
  cue: string | null;
}

export interface DeviceRepeat {
  type: 'repeat';
  times: number;
  steps: DeviceStep[];
}

export type DeviceItem = DeviceStep | DeviceRepeat;

function plain(step: WorkoutStep): DeviceStep {
  return {
    type: 'step',
    kind: step.kind,
    duration_s: step.duration_s,
    ...(step.distance_m ? { distance_m: step.distance_m } : {}),
    zone: step.zone,
    target: step.target,
    cadence: step.cadence,
    cue: step.cue,
  };
}

function sameRange(a: { low: number; high: number } | null, b: { low: number; high: number } | null): boolean {
  if (a === null || b === null) return a === b;
  return a.low === b.low && a.high === b.high;
}

function sameBlock(a: WorkoutStep, b: WorkoutStep): boolean {
  return (
    a.kind === b.kind &&
    a.duration_s === b.duration_s &&
    (a.distance_m ?? null) === (b.distance_m ?? null) &&
    a.zone === b.zone &&
    a.cue === b.cue &&
    (a.target?.unit ?? null) === (b.target?.unit ?? null) &&
    sameRange(a.target, b.target) &&
    sameRange(a.cadence, b.cadence)
  );
}

/** The set starting at `start`, when the blocks there are one: its pattern and how many times it repeats. */
function readSet(steps: readonly WorkoutStep[], start: number): { times: number; pattern: WorkoutStep[] } | null {
  const first = steps[start];
  const times = first.reps;
  if (first.rep !== 1 || times === null || times < 2) return null;

  // The pattern is the run of blocks marked "1 of N".
  let length = 0;
  while (start + length < steps.length && steps[start + length].rep === 1 && steps[start + length].reps === times) length += 1;
  if (start + length * times > steps.length) return null;

  const pattern = steps.slice(start, start + length);
  for (let rep = 2; rep <= times; rep += 1) {
    for (let j = 0; j < length; j += 1) {
      const step = steps[start + (rep - 1) * length + j];
      if (step.rep !== rep || step.reps !== times || !sameBlock(step, pattern[j])) return null;
    }
  }
  return { times, pattern };
}

/** The workout as steps and repeats, in riding order. */
export function toDeviceSteps(workout: Pick<Workout, 'steps'>): DeviceItem[] {
  const { steps } = workout;
  const items: DeviceItem[] = [];
  let i = 0;
  while (i < steps.length) {
    const set = readSet(steps, i);
    if (set) {
      items.push({ type: 'repeat', times: set.times, steps: set.pattern.map(plain) });
      i += set.pattern.length * set.times;
    } else {
      items.push(plain(steps[i]));
      i += 1;
    }
  }
  return items;
}
