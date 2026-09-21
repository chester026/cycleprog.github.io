/**
 * Single, server-computed ride-power estimate (T-3.5,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.5, docs/audit/layers/04-cross-layer.md
 * §4.5, docs/audit/layers/02-bikelabapp.md A-14,
 * docs/audit/layers/03-react-spa.md W-26).
 *
 * Reconciles five copies of the same physics model that used to live in
 * `server/server.js` (`avg_power` goal block — now
 * `calc/goalProgress.ts`'s `calculateAvgPowerLegacy`, T-3.4),
 * `BikeLabApp/src/components/PowerAnalysis.tsx`,
 * `react-spa/src/components/PowerAnalysis.jsx`,
 * `react-spa/src/pages/TrainingsPage.jsx` and the (already-deleted)
 * `react-spa/src/utils/goalsCache.js`. All five agreed on the underlying
 * physics — `power = rolling + aero (+/-) gravity`, `GRAVITY = 9.81`,
 * `CD_A = 0.4` — and diverged only in three places, reconciled here as
 * follows:
 *
 * 1. **Rolling resistance (Crr).** The app's copy was the only one that
 *    varied Crr by surface (`asphalt 0.005, concrete 0.006, gravel 0.012,
 *    dirt 0.015, mountain 0.020`); every other copy hardcoded `0.005`
 *    (asphalt). Kept the app's per-surface table, collapsed to this
 *    module's 3-value `surface` param (`road` -> asphalt's 0.005, `gravel`
 *    -> 0.012, `mtb` -> mountain's 0.020) since no copy exposed a surface
 *    picker to riders beyond "road bike vs off-road" in practice; `crr` can
 *    still be passed directly to override.
 * 2. **Wind.** Only the two `PowerAnalysis` copies (app + web) fetched wind
 *    (via `/api/weather/wind`) and folded it into the aero term; the
 *    `TrainingsPage`/goal-progress copies never had wind at all. Ported the
 *    `PowerAnalysis` treatment verbatim: wind is capped at 5 m/s of effect
 *    and applied at a flat 30% multiplier to the *speed* used in the aero
 *    cube term — `effectiveSpeed = avgSpeed + min(windSpeedMs, 5) * 0.3`.
 *    Note this — like every copy it was ported from — does **not** project
 *    wind direction onto the ride's heading (Strava's summary activity
 *    carries no per-point bearing to project against); `directionDeg` is
 *    accepted and returned for callers that want to display it, but any
 *    nonzero wind speed is treated as adding drag, not distinguishing head
 *    from tailwind. Documented here rather than silently "fixed", since
 *    getting real head/tailwind would need the full GPS stream, which is
 *    out of scope for this estimate.
 * 3. **Minimum power on descent.** The app's copy computed an elaborate
 *    speed/elevation heuristic to *guess* whether a positive
 *    `total_elevation_gain` reading was actually a net descent (Strava's
 *    summary field is gain-only), then floored descent power at
 *    `max(10, |grade| * 100)`. `TrainingsPage` and the ported
 *    `goalProgress.ts` both floored flat/descending grades (`grade <= 0`)
 *    at a flat `20`. Kept the simpler, already-shared `grade <= 0 -> floor
 *    at 20` rule: the app's heuristic is guessing at data this module
 *    doesn't have either (no stream access), so it wouldn't be any more
 *    accurate here, just harder to test and reason about.
 *
 * Rider/bike weight: every copy read rider weight from the user's profile
 * and defaulted bike weight to `8`kg when absent — kept as the
 * `riderWeightKg` (required — callers must resolve a profile weight
 * fallback themselves) / `bikeWeightKg` (default `8`) params.
 */
import { z } from 'zod';
import type { StravaActivity } from '../types/activity.js';

const GRAVITY = 9.81;
const DEFAULT_CD_A = 0.4;
const DEFAULT_BIKE_WEIGHT_KG = 8;
const MIN_POWER_ON_DESCENT = 20;
const MAX_PLAUSIBLE_WATTS = 10000;
const MAX_WIND_EFFECT_MS = 5;
const WIND_EFFECT_MULTIPLIER = 0.3;

export type Surface = 'road' | 'gravel' | 'mtb';

const CRR_BY_SURFACE: Record<Surface, number> = {
  road: 0.005,
  gravel: 0.012,
  mtb: 0.02,
};

export interface WindInput {
  speedMs: number;
  directionDeg?: number | null;
}

export interface EstimateRidePowerParams {
  riderWeightKg: number;
  bikeWeightKg?: number;
  crr?: number;
  cdA?: number;
  surface?: Surface;
  wind?: WindInput | null;
  airTempC?: number | null;
  elevationM?: number | null;
}

/** Subset of a Strava activity this estimate actually reads. */
export type PowerEstimateActivityInput = Pick<
  StravaActivity,
  'distance' | 'moving_time' | 'total_elevation_gain' | 'average_speed' | 'average_watts' | 'device_watts'
> &
  Partial<Pick<StravaActivity, 'average_temp' | 'elev_high'>>;

export const PowerEstimateSchema = z.object({
  avgWatts: z.number().nullable(),
  components: z.object({
    rolling: z.number(),
    aero: z.number(),
    gravity: z.number(),
  }),
  method: z.enum(['measured', 'estimated']),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type PowerEstimate = z.infer<typeof PowerEstimateSchema>;

/** Same barometric-formula air density used by every ported copy. */
export function calculateAirDensity(
  temperatureC: number | null | undefined,
  elevationM: number | null | undefined
): number {
  const tempK = temperatureC != null ? temperatureC + 273.15 : 288.15; // 15C default
  const heightM = elevationM || 0;
  const pressureAtHeight = 101325 * Math.exp(-heightM / 7400);
  const R = 287.05;
  return pressureAtHeight / (R * tempK);
}

function nullEstimate(confidence: PowerEstimate['confidence'] = 'low'): PowerEstimate {
  return { avgWatts: null, components: { rolling: 0, aero: 0, gravity: 0 }, method: 'estimated', confidence };
}

/**
 * Estimates a ride's average power. `device_watts && average_watts`
 * (a real power meter, incl. Zwift/VirtualRide with `device_watts: true`)
 * short-circuits to the measured value — no physics involved. Otherwise
 * runs the reconciled physics model documented in this module's header.
 * Returns `avgWatts: null` (never throws) when the activity lacks enough
 * data (no distance/time, non-positive speed) or the result is not
 * physically plausible (NaN, negative, or absurdly large).
 */
export function estimateRidePower(
  activity: PowerEstimateActivityInput,
  params: EstimateRidePowerParams
): PowerEstimate {
  if (activity.device_watts && activity.average_watts) {
    return {
      avgWatts: Math.round(activity.average_watts),
      components: { rolling: 0, aero: 0, gravity: 0 },
      method: 'measured',
      confidence: 'high',
    };
  }

  const riderWeightKg = params.riderWeightKg;
  const bikeWeightKg = params.bikeWeightKg ?? DEFAULT_BIKE_WEIGHT_KG;
  const totalWeight = riderWeightKg + bikeWeightKg;
  const cdA = params.cdA ?? DEFAULT_CD_A;
  const crr = params.crr ?? CRR_BY_SURFACE[params.surface ?? 'road'];

  const distance = activity.distance || 0;
  const time = activity.moving_time || 0;
  const elevationGain = activity.total_elevation_gain || 0;
  const avgSpeed = distance > 0 && time > 0 ? distance / time : 0;

  if (!(riderWeightKg > 0) || distance <= 0 || time <= 0 || avgSpeed <= 0) {
    return nullEstimate('low');
  }

  const airDensity = calculateAirDensity(
    params.airTempC ?? activity.average_temp ?? null,
    params.elevationM ?? activity.elev_high ?? null
  );

  const averageGrade = elevationGain / distance;
  const rollingPower = crr * totalWeight * GRAVITY * avgSpeed;
  const gravityPower = totalWeight * GRAVITY * averageGrade * avgSpeed;

  let aeroSpeed = avgSpeed;
  const wind = params.wind;
  if (wind && wind.speedMs > 0) {
    const effect = Math.min(wind.speedMs, MAX_WIND_EFFECT_MS) * WIND_EFFECT_MULTIPLIER;
    aeroSpeed = avgSpeed + effect;
  }
  const aeroPower = 0.5 * airDensity * cdA * Math.pow(aeroSpeed, 3);

  let totalPower = rollingPower + aeroPower + gravityPower;
  if (averageGrade <= 0) {
    totalPower = Math.max(MIN_POWER_ON_DESCENT, totalPower);
  }

  if (!Number.isFinite(totalPower) || totalPower < 0 || totalPower > MAX_PLAUSIBLE_WATTS) {
    return nullEstimate('low');
  }

  return {
    avgWatts: Math.round(totalPower),
    components: {
      rolling: Math.round(rollingPower),
      aero: Math.round(aeroPower),
      gravity: Math.round(gravityPower),
    },
    method: 'estimated',
    confidence: wind && wind.speedMs > 0 ? 'medium' : 'low',
  };
}

export interface PersistedPowerEstimate {
  avgWatts: number | null;
  method: PowerEstimate['method'];
  confidence: PowerEstimate['confidence'];
  hasWind?: boolean;
}

/**
 * The one number to use whenever the app says "power" for a ride.
 *
 * BikeLab computes its own per-ride average (`synced_activities.
 * estimated_power`, written by server/services/power.js): for a ride with a
 * power meter that IS the measured value (`method: 'measured'`), and
 * otherwise it's the physics estimate with the rider's weight, the terrain
 * and the wind of that day. Strava's own `average_watts` on a ride without a
 * meter is a crude, systematically low guess — mixing the two put different
 * scales next to each other across the app (a goal's target vs the garage
 * widget vs a coach comparison), so every power read goes through here.
 *
 * The raw fields stay as a last resort for rides whose estimate could not be
 * computed at all (no distance/time), never as a preferred source.
 */
export function ridePowerWatts(
  activity: { estimated_power?: PersistedPowerEstimate | null; weighted_average_watts?: number | null; average_watts?: number | null } | null | undefined,
): number | null {
  const estimated = activity?.estimated_power?.avgWatts;
  if (typeof estimated === 'number' && estimated > 0) return estimated;
  const raw = activity?.weighted_average_watts ?? activity?.average_watts;
  return typeof raw === 'number' && raw > 0 ? raw : null;
}

export interface PowerStatsActivityInput extends PowerEstimateActivityInput {
  id: number | string;
  start_date?: string;
  /**
   * A previously-computed, persisted estimate (`synced_activities.
   * estimated_power`, T-3.5). When present, `powerStatsForActivities` uses
   * it as-is instead of re-running the physics — this is what lets
   * `GET /api/analytics/summary` aggregate the *exact same* numbers
   * `GET /api/activities` already served, with no extra weather calls.
   * Callers without a persisted value (e.g. a client that only has the raw
   * activity) simply omit this and get a fresh estimate.
   */
  estimated_power?: PersistedPowerEstimate | null;
}

export interface PerActivityPower {
  id: number | string;
  date: string | undefined;
  avgWatts: number | null;
  method: PowerEstimate['method'];
  confidence: PowerEstimate['confidence'];
}

export interface PowerStatsResult {
  avg: number | null;
  best: number | null;
  worst: number | null;
  trend: number | null;
  totalActivities: number;
  activitiesWithRealPower: number;
  activitiesWithWindData: number;
  perActivity: PerActivityPower[];
}

/**
 * Replicates `PowerAnalysis`'s `stats` object (avg/max/min/counts) plus its
 * chart series, as one aggregate over a list of activities — the same
 * shape both clients' stat cards and `GET /api/analytics/summary`'s
 * `power` field read. `windByActivityId` is optional per-activity wind
 * (server callers pass what they fetched/cached; a bare client call with
 * no wind data still gets a full (wind-less) estimate for every ride).
 */
export function powerStatsForActivities(
  activities: PowerStatsActivityInput[],
  params: Omit<EstimateRidePowerParams, 'wind'>,
  windByActivityId?: Record<string, WindInput | null | undefined>
): PowerStatsResult {
  const perActivity: PerActivityPower[] = activities.map((activity) => {
    if (activity.estimated_power) {
      return {
        id: activity.id,
        date: activity.start_date,
        avgWatts: activity.estimated_power.avgWatts,
        method: activity.estimated_power.method,
        confidence: activity.estimated_power.confidence,
      };
    }
    const wind = windByActivityId ? windByActivityId[String(activity.id)] ?? null : null;
    const estimate = estimateRidePower(activity, { ...params, wind });
    return {
      id: activity.id,
      date: activity.start_date,
      avgWatts: estimate.avgWatts,
      method: estimate.method,
      confidence: estimate.confidence,
    };
  });

  const withPower = perActivity.filter((p): p is PerActivityPower & { avgWatts: number } => p.avgWatts != null);
  const watts = withPower.map((p) => p.avgWatts);

  const avg = watts.length ? Math.round(watts.reduce((sum, w) => sum + w, 0) / watts.length) : null;
  const best = watts.length ? Math.max(...watts) : null;
  const worst = watts.length ? Math.min(...watts) : null;

  // Trend: newest half vs. older half of the activities that have an
  // estimate, ordered as given (callers pass activities newest-first, same
  // as `GET /api/activities`). Needs at least 2 in each half or comes back
  // null so callers can hide a misleading badge.
  let trend: number | null = null;
  if (withPower.length >= 4) {
    const mid = Math.floor(withPower.length / 2);
    const newer = withPower.slice(0, mid);
    const older = withPower.slice(mid);
    const avgOf = (list: typeof withPower) => list.reduce((sum, p) => sum + p.avgWatts, 0) / list.length;
    trend = Math.round(avgOf(newer) - avgOf(older));
  }

  const activitiesWithRealPower = perActivity.filter((p) => p.method === 'measured').length;
  const activitiesWithWindData = activities.filter((a) => {
    if (a.estimated_power) return !!a.estimated_power.hasWind;
    const wind = windByActivityId ? windByActivityId[String(a.id)] : null;
    return !!wind && wind.speedMs > 0;
  }).length;

  return {
    avg,
    best,
    worst,
    trend,
    totalActivities: activities.length,
    activitiesWithRealPower,
    activitiesWithWindData,
    perActivity,
  };
}
