/**
 * The coach's description of a session → the stored `Workout`
 * (types/calendar.ts): validated, defaults filled in, sets expanded into a
 * flat list of blocks.
 *
 * The input is what the model passes as `workout_steps` to
 * create_calendar_event / update_calendar_event (server/aiCoach.js): a list
 * whose items are either a block
 *
 *   { kind, minutes, zone, watts_low, watts_high, bpm_low, bpm_high,
 *     cadence_low, cadence_high, cue }
 *
 * or a set of blocks repeated N times
 *
 *   { repeat: 3, steps: [ {work…}, {recovery…} ] }
 *
 * so "3×8′ @ 240–250 W, 4′ recovery" is written once and comes out as six
 * blocks. The model's output is treated as untrusted: anything that can be
 * read sensibly is kept (a missing zone falls back to the kind's usual one,
 * a swapped range is put the right way round), and what cannot is an error
 * string the model can act on — never a thrown exception, never a silently
 * wrong workout.
 */
import { WORKOUT_STEP_KINDS, type Workout, type WorkoutStep, type WorkoutStepKind, type WorkoutTarget } from '../types/calendar.js';

/** A workout longer than this is a typo (minutes meant as seconds), not a plan. */
export const WORKOUT_MAX_DURATION_S = 12 * 60 * 60;
/** More blocks than this cannot be drawn or followed; micro-intervals belong in one block's cue. */
export const WORKOUT_MAX_STEPS = 60;
export const WORKOUT_MAX_REPEAT = 30;
/** Shortest block that is a block (a sprint), seconds. */
export const WORKOUT_MIN_STEP_S = 5;
const CUE_MAX_LENGTH = 240;

/** The zone a block of this kind is ridden in when the coach did not say. */
const DEFAULT_ZONE: Record<WorkoutStepKind, number> = { warmup: 2, work: 4, recovery: 1, cooldown: 1, steady: 2 };

export type BuildWorkoutResult = { ok: true; workout: Workout } | { ok: false; error: string };

type Raw = Record<string, unknown>;

function asObject(value: unknown): Raw | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** A low/high pair from whichever of the two was given, the right way round; null when neither was. */
function range(lowRaw: unknown, highRaw: unknown): { low: number; high: number } | null {
  const a = positive(lowRaw);
  const b = positive(highRaw);
  if (a === null && b === null) return null;
  const low = Math.round(a ?? (b as number));
  const high = Math.round(b ?? (a as number));
  return low <= high ? { low, high } : { low: high, high: low };
}

function buildStep(raw: Raw, where: string): WorkoutStep | string {
  const kind = (WORKOUT_STEP_KINDS as readonly unknown[]).includes(raw.kind) ? (raw.kind as WorkoutStepKind) : 'steady';
  const minutes = positive(raw.minutes);
  if (minutes === null) return `${where}: minutes must be a number above 0`;
  const duration = Math.round(minutes * 60);
  if (duration < WORKOUT_MIN_STEP_S) return `${where}: a block must be at least ${WORKOUT_MIN_STEP_S} seconds`;

  const zoneRaw = positive(raw.zone);
  const zone = zoneRaw === null ? DEFAULT_ZONE[kind] : Math.min(7, Math.max(1, Math.round(zoneRaw)));
  const watts = range(raw.watts_low, raw.watts_high);
  const bpm = range(raw.bpm_low, raw.bpm_high);
  const target: WorkoutTarget | null = watts ? { unit: 'w', ...watts } : bpm ? { unit: 'bpm', ...bpm } : null;
  const cue = typeof raw.cue === 'string' && raw.cue.trim() ? raw.cue.trim().slice(0, CUE_MAX_LENGTH) : null;

  return {
    kind,
    duration_s: duration,
    zone,
    target,
    cadence: range(raw.cadence_low, raw.cadence_high),
    cue,
    rep: null,
    reps: null,
  };
}

/**
 * Builds the stored workout from the model's `workout_steps`.
 * `{ ok: false, error }` names the first thing that could not be read.
 */
export function buildWorkout(input: unknown): BuildWorkoutResult {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'workout_steps must be a non-empty list of blocks' };

  const steps: WorkoutStep[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const item = asObject(input[i]);
    const where = `workout_steps[${i}]`;
    if (!item) return { ok: false, error: `${where} must be an object` };

    if (item.steps === undefined) {
      const step = buildStep(item, where);
      if (typeof step === 'string') return { ok: false, error: step };
      steps.push(step);
      continue;
    }

    // A set: its blocks, `repeat` times over.
    if (!Array.isArray(item.steps) || item.steps.length === 0) return { ok: false, error: `${where}.steps must be a non-empty list of blocks` };
    const repeatRaw = positive(item.repeat);
    const repeat = repeatRaw === null ? 1 : Math.round(repeatRaw);
    if (repeat > WORKOUT_MAX_REPEAT) return { ok: false, error: `${where}.repeat is ${repeat}; at most ${WORKOUT_MAX_REPEAT}` };
    const inner: WorkoutStep[] = [];
    for (let j = 0; j < item.steps.length; j += 1) {
      const innerItem = asObject(item.steps[j]);
      const innerWhere = `${where}.steps[${j}]`;
      if (!innerItem) return { ok: false, error: `${innerWhere} must be an object` };
      if (innerItem.steps !== undefined) return { ok: false, error: `${innerWhere}: a set cannot contain another set — write the inner one out as blocks` };
      const step = buildStep(innerItem, innerWhere);
      if (typeof step === 'string') return { ok: false, error: step };
      inner.push(step);
    }
    for (let rep = 1; rep <= repeat; rep += 1) {
      for (const step of inner) steps.push(repeat > 1 ? { ...step, rep, reps: repeat } : step);
    }
    if (steps.length > WORKOUT_MAX_STEPS) break;
  }

  if (steps.length > WORKOUT_MAX_STEPS) {
    return { ok: false, error: `the workout comes to more than ${WORKOUT_MAX_STEPS} blocks; describe very short repeats in one block's cue instead` };
  }
  const total = steps.reduce((sum, step) => sum + step.duration_s, 0);
  if (total > WORKOUT_MAX_DURATION_S) {
    return { ok: false, error: `the blocks add up to ${Math.round(total / 60)} minutes; check that every "minutes" value is in minutes` };
  }
  return { ok: true, workout: { version: 1, duration_s: total, steps } };
}

/** Whole minutes the workout takes — what the event's duration is set to. */
export function workoutMinutes(workout: Workout): number {
  return Math.max(1, Math.round(workout.duration_s / 60));
}
