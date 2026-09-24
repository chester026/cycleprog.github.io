/**
 * Goal recap — the numbers behind a completed goal's share card: how far,
 * how high, how many rides and hours it took, over the goal's own window.
 *
 * Pure (no React, no i18n, no network) so it's unit-testable and reusable by
 * both GoalShareStudioModal and the Garage "Goals" strip.
 *
 * Window: [created_at's local day, completion] — the same start the server
 * measures sub-goals from (services/goals.js goalWindow uses
 * created_at::date). The end is when the goal was completed
 * (`completed_at`, falling back to `updated_at` for servers that predate
 * that column), capped at the end of `target_date`: a goal finished after
 * its deadline was measured only up to the deadline, so rides after it
 * didn't count towards it and don't count here either. Still-active goals
 * (a preview) run up to `now`.
 */
import type {MetaGoal} from '@bikelab/shared/types';
import type {Activity} from '../../../types/activity';

const DAY_MS = 86_400_000;
const EVEREST_M = 8849;

/** Strava types/sport_types that count as a ride in the recap. */
export const CYCLING_TYPES: ReadonlySet<string> = new Set([
  'Ride',
  'VirtualRide',
  'EBikeRide',
  'GravelRide',
  'MountainBikeRide',
  'EMountainBikeRide',
  'Velomobile',
  'Handcycle',
]);

export function isCyclingActivity(a: Pick<Activity, 'type' | 'sport_type'>): boolean {
  return CYCLING_TYPES.has(a.type) || (!!a.sport_type && CYCLING_TYPES.has(a.sport_type));
}

type DateLike = string | Date | null | undefined;

function toDate(v: DateLike): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A DATE column ('YYYY-MM-DD') read as a LOCAL calendar day — `new Date('2026-10-03')` would be UTC midnight. */
function parseLocalDay(v: DateLike): Date | null {
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return toDate(v);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export type RecapGoal = Pick<MetaGoal, 'created_at' | 'target_date' | 'status'> & {
  updated_at?: DateLike;
  completed_at?: DateLike;
};

export interface GoalWindow {
  start: Date;
  end: Date;
}

export function goalRecapWindow(goal: RecapGoal, now: Date = new Date()): GoalWindow {
  const start = startOfDay(toDate(goal.created_at) ?? now);
  const finishedAt =
    goal.status === 'completed' ? toDate(goal.completed_at) ?? toDate(goal.updated_at) ?? now : now;
  const targetDay = parseLocalDay(goal.target_date);
  const deadline = targetDay ? endOfDay(targetDay) : null;
  let end = deadline && deadline < finishedAt ? deadline : finishedAt;
  if (end < start) end = endOfDay(start);
  return {start, end};
}

/** When the goal was completed: completed_at, else updated_at (older servers), else now. */
export function goalCompletedAt(goal: RecapGoal, now: Date = new Date()): Date {
  return toDate(goal.completed_at) ?? toDate(goal.updated_at) ?? now;
}

export interface GoalRecap {
  start: Date;
  end: Date;
  /** Calendar days in the window, inclusive (>= 1). */
  days: number;
  distanceKm: number;
  elevationM: number;
  rides: number;
  movingHours: number;
  /** Distinct calendar days with at least one ride. */
  activeDays: number;
  longestRideKm: number;
  /** elevationM / Everest's height. */
  everests: number;
}

export function computeGoalRecap(goal: RecapGoal, activities: Activity[] | null | undefined, now: Date = new Date()): GoalRecap {
  const {start, end} = goalRecapWindow(goal, now);
  const rides = (activities ?? []).filter(a => {
    if (!isCyclingActivity(a)) return false;
    const d = toDate(a.start_date);
    return !!d && d >= start && d <= end;
  });

  let distance = 0;
  let elevation = 0;
  let moving = 0;
  let longest = 0;
  const days = new Set<string>();
  for (const a of rides) {
    distance += a.distance || 0;
    elevation += a.total_elevation_gain || 0;
    moving += a.moving_time || 0;
    longest = Math.max(longest, a.distance || 0);
    const d = toDate(a.start_date)!;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  const windowDays = Math.max(1, Math.round((startOfDay(end).getTime() - start.getTime()) / DAY_MS) + 1);

  return {
    start,
    end,
    days: windowDays,
    distanceKm: distance / 1000,
    elevationM: elevation,
    rides: rides.length,
    movingHours: moving / 3600,
    activeDays: days.size,
    longestRideKm: longest / 1000,
    everests: elevation / EVEREST_M,
  };
}

// --- formatting -------------------------------------------------------------

/** Thin space: groups thousands in the big display numbers ("12 480") the same way in every locale. */
const GROUP_SEPARATOR = ' ';

/**
 * Integer for the big display numbers. Four digits stay solid ("2924", as in
 * the design); from five up they get thin-space grouping ("12 480").
 */
export function formatBigNumber(n: number): string {
  const rounded = Math.round(Number.isFinite(n) ? n : 0);
  const str = rounded.toString();
  return Math.abs(rounded) < 10000 ? str : str.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/** km: whole numbers from 100 up ("1 240"), one decimal below ("42.7"). */
export function formatRecapKm(km: number): string {
  if (km >= 100) return formatBigNumber(km);
  return (Math.round(km * 10) / 10).toFixed(km > 0 ? 1 : 0);
}

/** hours in the saddle: whole from 10 up, one decimal below. */
export function formatRecapHours(h: number): string {
  if (h >= 10) return formatBigNumber(h);
  return h > 0 ? (Math.round(h * 10) / 10).toFixed(1) : '0';
}

/** "×1.6" — one decimal, trailing .0 dropped. */
export function formatMultiplier(x: number): string {
  const v = Math.round(x * 10) / 10;
  return `×${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}`;
}

export type HeroMetric = 'distance' | 'rides' | 'days';

/**
 * What gets the giant number: distance when the goal involved riding at all,
 * else ride count, else days — a recovery/HRV goal can legitimately have no
 * kilometres in it and a "0 km" hero would read as failure.
 */
export function pickHeroMetric(recap: Pick<GoalRecap, 'distanceKm' | 'rides'>): HeroMetric {
  if (recap.distanceKm >= 1) return 'distance';
  if (recap.rides > 0) return 'rides';
  return 'days';
}
