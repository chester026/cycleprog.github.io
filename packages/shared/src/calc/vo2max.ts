/**
 * Single, server-computed VO2max estimate (T-3.2,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.2, docs/audit/layers/04-cross-layer.md
 * §4.3, docs/audit/layers/01-server.md S-33). Replaces:
 *  - `server.js`'s `/api/analytics/summary` inline `estimateVO2max`
 *    (formerly ~line 1486),
 *  - `server.js`'s `calculateVO2maxForPeriod` inline `estimateVO2max`
 *    (formerly ~line 1693), used by `POST /api/goals/recalc-vo2max/:id` and
 *    goal progress,
 *  - `BikeLabApp/src/screens/AnalysisScreen.tsx`'s local `calculateVO2max`.
 *
 * The two server copies had already drifted (§4.3): a `bestSpeed < 10 km/h`
 * guard only in the analytics-summary copy, and two different "fitness
 * bonus" schedules (interval/long-ride COUNT thresholds in the summary
 * copy vs. a rides-per-week schedule in the goals copy). This module ports
 * the **goals-path variant** as canonical — it is what feeds
 * `POST /api/goals/recalc-vo2max/:id` and goal progress, i.e. numbers the
 * user sets targets against, so it is the one worth being consistent with
 * app-side. See the module doc in `docs/audit/00-AUDIT-AND-PLAN.md` T-3.2
 * report for the exact numeric deltas this produces on
 * `/api/analytics/summary` relative to the old inline copy there:
 *  - No more `bestSpeed < 10` → `null` guard: a user whose best speed in the
 *    window is under 10 km/h now gets a (very low, clamped to 25) number
 *    instead of `null`.
 *  - The "fitness bonus" for training load is now based on rides/week over
 *    the activity list's own date span rather than absolute interval/long-
 *    ride counts and a fixed "last 30 days" lookback — so the bonus a given
 *    activity set earns can differ slightly (typically a few tenths of a
 *    ml/kg/min after rounding) from what the old summary endpoint showed.
 */
import { z } from 'zod';

export interface Vo2maxActivityInput {
  /** Strava activity type, e.g. 'Ride' / 'VirtualRide'. */
  type?: string | null;
  /** m/s, Strava's native unit. */
  average_speed?: number | null;
  average_heartrate?: number | null;
  /** seconds. */
  moving_time?: number | null;
  /** meters. */
  distance?: number | null;
  /** ISO date string. */
  start_date: string;
  name?: string | null;
}

export interface Vo2maxProfileInput {
  age?: number | null;
  weight?: number | null;
  gender?: string | null;
  resting_hr?: number | null;
  max_hr?: number | null;
}

export interface Vo2maxEstimateOptions {
  /**
   * Restrict to activities within the last N days (relative to `now`)
   * before estimating. `null` disables date filtering (use exactly the
   * activities passed in — useful when the caller already filtered by
   * period, as both server call sites used to do). Default: 28 (the "4w"
   * period `/api/analytics/summary` defaults to).
   */
  windowDays?: number | null;
  /** Activity types to include. Default: `['Ride', 'VirtualRide']`. */
  types?: string[];
  /** Injectable "now", for deterministic tests. Default: `new Date()`. */
  now?: Date;
}

export interface Vo2maxEstimateDetails {
  bestSpeedKmh: number;
  avgHr: number | null;
  ageAdjustment: number;
  genderAdjustment: number;
  hrAdjustment: number;
  fitnessBonus: number;
  intervalsCount: number;
  longRidesCount: number;
  ridesPerWeek: number;
}

export interface Vo2maxEstimate {
  vo2max: number | null;
  method: 'hr-speed' | 'none';
  sampleSize: number;
  details?: Vo2maxEstimateDetails;
}

export const Vo2maxEstimateSchema = z.object({
  vo2max: z.number().nullable(),
  method: z.enum(['hr-speed', 'none']),
  sampleSize: z.number().int().nonnegative(),
  details: z
    .object({
      bestSpeedKmh: z.number(),
      avgHr: z.number().nullable(),
      ageAdjustment: z.number(),
      genderAdjustment: z.number(),
      hrAdjustment: z.number(),
      fitnessBonus: z.number(),
      intervalsCount: z.number().int().nonnegative(),
      longRidesCount: z.number().int().nonnegative(),
      ridesPerWeek: z.number(),
    })
    .optional(),
});

const DEFAULT_TYPES = ['Ride', 'VirtualRide'];
const DEFAULT_WINDOW_DAYS = 28;

function isIntervalActivity(a: Vo2maxActivityInput): boolean {
  const name = (a.name || '').toLowerCase();
  const type = (a.type || '').toLowerCase();
  return name.includes('интервал') || name.includes('interval') || type.includes('interval');
}

function isLongRide(a: Vo2maxActivityInput): boolean {
  return (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600;
}

/**
 * Estimates VO2max (ml/kg/min) from a rider's ride history + profile.
 * Canonical port of the server's former `calculateVO2maxForPeriod` inner
 * `estimateVO2max` (see module doc above for why that variant, and the
 * numeric deltas relative to the old `/api/analytics/summary` copy).
 *
 * Returns `{vo2max: null, method: 'none', sampleSize: 0}` when there is no
 * activity left after type/window filtering — never throws.
 */
export function estimateVO2maxFromActivities(
  activities: Vo2maxActivityInput[],
  profile: Vo2maxProfileInput | null | undefined,
  opts: Vo2maxEstimateOptions = {},
): Vo2maxEstimate {
  const types = opts.types ?? DEFAULT_TYPES;
  const windowDays = opts.windowDays === undefined ? DEFAULT_WINDOW_DAYS : opts.windowDays;
  const now = opts.now ?? new Date();

  let acts = (activities || []).filter((a) => !a.type || types.includes(a.type));
  if (windowDays !== null) {
    const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    acts = acts.filter((a) => new Date(a.start_date) > cutoff);
  }

  if (acts.length === 0) {
    return { vo2max: null, method: 'none', sampleSize: 0 };
  }

  const bestSpeedKmh = Math.max(...acts.map((a) => (a.average_speed || 0) * 3.6));
  const withHr = acts.filter((a) => a.average_heartrate);
  // `a.average_heartrate` is always truthy here (that's exactly what the
  // `withHr` filter above selected for), so a non-null assertion documents
  // that instead of keeping an unreachable `|| 0` fallback (T-7.2).
  const avgHr = withHr.length > 0 ? withHr.reduce((sum, a) => sum + a.average_heartrate!, 0) / withHr.length : null;

  const age = profile?.age || 35;
  const weight = profile?.weight || 75;
  const gender = profile?.gender || 'male';
  const restingHr = profile?.resting_hr || 60;
  const maxHr = profile?.max_hr || 220 - age;

  let vo2max: number;
  if (bestSpeedKmh >= 40) {
    vo2max = 2.8 * bestSpeedKmh - 25;
  } else {
    vo2max = 1.8 * bestSpeedKmh + 10;
  }

  const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
  vo2max *= ageAdjustment;

  const genderAdjustment = gender === 'female' ? 0.88 : 1;
  vo2max *= genderAdjustment;

  let hrAdjustment = 1;
  if (avgHr && restingHr && maxHr) {
    const hrReserve = maxHr - restingHr;
    const avgHrPercent = (avgHr - restingHr) / hrReserve;
    if (avgHrPercent > 0.85 && bestSpeedKmh < 35) {
      hrAdjustment = 0.92;
    } else if (avgHrPercent < 0.7 && bestSpeedKmh > 30) {
      hrAdjustment = 1.05;
    }
  }
  vo2max *= hrAdjustment;

  const intervals = acts.filter(isIntervalActivity);
  const longRides = acts.filter(isLongRide);
  const totalRides = acts.length;
  const earliestMs = Math.min(...acts.map((a) => new Date(a.start_date).getTime()));
  const daysSpan = Math.max(1, (now.getTime() - earliestMs) / (1000 * 60 * 60 * 24));
  const ridesPerWeek = (totalRides / daysSpan) * 7;

  let fitnessBonus = 1;
  if (intervals.length >= 1) fitnessBonus += 0.03;
  if (intervals.length >= 3) fitnessBonus += 0.02;
  if (longRides.length >= 1) fitnessBonus += 0.02;
  if (longRides.length >= 3) fitnessBonus += 0.02;
  if (ridesPerWeek >= 3) fitnessBonus += 0.03;
  if (ridesPerWeek >= 5) fitnessBonus += 0.02;
  vo2max *= fitnessBonus;

  vo2max = Math.max(25, Math.min(80, vo2max));
  vo2max = Math.round(vo2max);

  // `weight` is accepted (mirrors the original profile shape/signature) but,
  // same as the ported server code, does not affect the result — kept as a
  // documented no-op rather than silently dropped from the type.
  void weight;

  return {
    vo2max,
    method: 'hr-speed',
    sampleSize: acts.length,
    details: {
      bestSpeedKmh,
      avgHr,
      ageAdjustment,
      genderAdjustment,
      hrAdjustment,
      fitnessBonus,
      intervalsCount: intervals.length,
      longRidesCount: longRides.length,
      ridesPerWeek,
    },
  };
}

export interface CooperTestOptions {
  age?: number | null;
  weight?: number | null;
  gender?: 'male' | 'female' | string | null;
}

/**
 * Cooper 12-minute test VO2max estimate: `0.02241 * distanceMeters - 11.288`,
 * with the age/gender/weight adjustments applied identically by all three
 * client copies this replaces (`BikeLabApp/src/components/VO2maxWidget.tsx`,
 * `react-spa/src/components/GarageCalculators.jsx`,
 * `react-spa/src/pages/GoalAssistantPage.jsx` — all three had the exact same
 * formula, so there was no drift to resolve here, unlike the estimated-VO2max
 * server copies above).
 */
export function cooperTestVO2max(distanceMeters: number, opts: CooperTestOptions = {}): number {
  let vo2max = distanceMeters * 0.02241 - 11.288;

  const age = opts.age;
  if (typeof age === 'number') {
    if (age > 40) vo2max *= 1 - (age - 40) * 0.005;
    else if (age < 25) vo2max *= 1 + (25 - age) * 0.003;
  }

  if (opts.gender === 'female') {
    vo2max *= 0.9;
  }

  const weight = opts.weight;
  if (typeof weight === 'number') {
    if (weight > 80) vo2max *= 0.98;
    else if (weight < 60) vo2max *= 1.02;
  }

  return Math.round(vo2max);
}

export type Vo2maxCategory = 'beginner' | 'belowAverage' | 'average' | 'aboveAverage' | 'excellent' | 'elite';

/**
 * Fitness-level bucket for a VO2max value (ml/kg/min), same boundaries used
 * by `VO2maxWidget.tsx`'s `getLevel` and `GarageCalculators.jsx`'s inline
 * table (both: <30/<40/<50/<60/<70/else). Neither client varies the
 * boundaries by age or gender, so `age`/`gender` are accepted for a future
 * age/gender-adjusted table but currently ignored — documented rather than
 * silently unsupported.
 */
export function vo2maxCategory(vo2max: number, _age?: number | null, _gender?: string | null): Vo2maxCategory {
  if (vo2max < 30) return 'beginner';
  if (vo2max < 40) return 'belowAverage';
  if (vo2max < 50) return 'average';
  if (vo2max < 60) return 'aboveAverage';
  if (vo2max < 70) return 'excellent';
  return 'elite';
}
