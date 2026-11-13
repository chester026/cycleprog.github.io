// Pure helpers for the workout-blocks views (WorkoutProfile, WorkoutBlocks):
// how tall a block is, where it starts, and how its numbers read
// (docs/plans/workout-blocks.md). The blocks themselves come ready-made from
// the server — `event.workout`, see @bikelab/shared's Workout type.
import type {WorkoutStep, WorkoutTarget} from '@bikelab/shared/types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Lowest block (zone 1) as a share of the profile's height; zone 7 is the
 * full height. High enough that an easy block is still a rounded bar and not
 * a sliver, with an even step between zones.
 */
export const MIN_BLOCK_HEIGHT = 0.4;

/** A block's height as a share of the profile's, from its intensity zone (1–7). */
export function blockHeightFraction(zone: number): number {
  const clamped = Math.min(7, Math.max(1, zone));
  return MIN_BLOCK_HEIGHT + ((1 - MIN_BLOCK_HEIGHT) * (clamped - 1)) / 6;
}

/**
 * Whether the block is what the session is about — an effort or steady
 * riding — as opposed to the frame around it (warm-up, recovery between
 * efforts, cool-down).
 */
export function isEffortBlock(step: Pick<WorkoutStep, 'kind'>): boolean {
  return step.kind === 'work' || step.kind === 'steady';
}

/**
 * A block's colour from the zone palette (index = zone − 1). Only effort
 * blocks carry their zone's colour; the frame is always the palette's
 * neutral first tone, whatever zone it is ridden in — so a session reads as
 * "grey, the work, grey" and a week of them is not a rainbow (owner,
 * 10.11.2026). Height still shows how hard each block is.
 */
export function blockColor(step: Pick<WorkoutStep, 'kind' | 'zone'>, zones: readonly string[]): string {
  if (!isEffortBlock(step)) {
    return zones[0];
  }
  return zones[Math.min(zones.length, Math.max(1, step.zone)) - 1];
}

/** Seconds from the start of the workout at which each block begins. */
export function blockStartOffsets(steps: readonly WorkoutStep[]): number[] {
  const offsets: number[] = [];
  let elapsed = 0;
  for (const step of steps) {
    offsets.push(elapsed);
    elapsed += step.duration_s;
  }
  return offsets;
}

/** Elapsed time as a clock: "0:00", "27:00", "1:05:00". */
export function formatWorkoutClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A block's length in words: "30 s", "8 min", "2 min 30 s", "1 h 15 min". */
export function formatBlockDuration(seconds: number, t: Translate): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total} ${t('calendar.workout.sec')}`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return m > 0 ? `${h} ${t('common.h')} ${m} ${t('common.min')}` : `${h} ${t('common.h')}`;
  }
  return s > 0 ? `${m} ${t('common.min')} ${s} ${t('calendar.workout.sec')}` : `${m} ${t('common.min')}`;
}

/** "240–250 W", "110 W", "150–160 bpm"; null when the block has no target. */
export function formatBlockTarget(target: WorkoutTarget | null | undefined, t: Translate): string | null {
  if (!target) {
    return null;
  }
  const unit = target.unit === 'w' ? t('common.watts') : t('common.bpm');
  return target.low === target.high ? `${target.low} ${unit}` : `${target.low}–${target.high} ${unit}`;
}

/** "85–95 rpm" / "90 rpm"; null when the block has no cadence. */
export function formatBlockCadence(cadence: WorkoutStep['cadence'], t: Translate): string | null {
  if (!cadence) {
    return null;
  }
  return cadence.low === cadence.high
    ? `${cadence.low} ${t('common.rpm')}`
    : `${cadence.low}–${cadence.high} ${t('common.rpm')}`;
}

/** The block's name, with its place in a set when it has one: "Effort 2 of 3". */
export function formatBlockName(step: WorkoutStep, t: Translate): string {
  const kind = t(`calendar.workout.kinds.${step.kind}`);
  return step.rep && step.reps ? `${kind} ${t('calendar.workout.repOf', {rep: step.rep, reps: step.reps})}` : kind;
}

/**
 * A block's length as the rider reads it: a distance block (a race plan's
 * climb or flat) is "6.1 km · ≈28 min" — it ends on the distance, the time is
 * the plan's estimate; a time block is its duration.
 */
export function formatBlockLength(step: Pick<WorkoutStep, 'duration_s' | 'distance_m'>, t: Translate): string {
  const duration = formatBlockDuration(step.duration_s, t);
  if (!step.distance_m) {
    return duration;
  }
  const km = step.distance_m >= 10000 ? Math.round(step.distance_m / 1000) : Math.round(step.distance_m / 100) / 10;
  return `${km} ${t('common.km')} · ≈${duration}`;
}
