/**
 * Single, server-computed goal-progress implementation (T-3.4,
 * docs/audit/00-AUDIT-AND-PLAN.md T-3.4, docs/audit/layers/04-cross-layer.md
 * §4.2, docs/audit/layers/03-react-spa.md W-08/W-09,
 * docs/audit/layers/02-bikelabapp.md A-13).
 *
 * Ports (and reconciles) the three drifted goal-progress implementations
 * §4.2 found:
 *  - `server/goalCalculator.js`'s declarative metric-based model
 *    (`calculateActivityProgress`/`calculateSkillsProgress`/
 *    `calculateProgress`/`addPaceData`) — the model NEW goals use, kept as
 *    the primary path here.
 *  - `server/server.js`'s legacy `calculateGoalProgress(goal, activities,
 *    userProfile)` — a switch on `goal.goal_type` for goals created before
 *    the metric-based redesign (`goal.metric` is null). Ported verbatim as
 *    the fallback path EXCEPT for two documented fixes below.
 *  - The web's `react-spa/src/utils/goalsCache.js` `calculateGoalProgress` —
 *    not used as the canonical implementation (it was already dead: the
 *    server recomputes on every `GET /api/goals` and clients now just render
 *    that), but its `intervals` heuristic is adopted below since the
 *    server's legacy `intervals` case was a known gap (always returned 0).
 *
 * Fixes applied during the port (both intentional deviations from the old
 * server switch, not preserved bugs):
 *  1. `recovery` — the server's legacy switch already compared `average_speed
 *     * 3.6 < 20` (km/h), which is correct. The WEB's copy instead compared
 *     `average_speed < 20` (m/s, i.e. 72 km/h) — effectively "almost every
 *     ride is a recovery ride". This port keeps the server's correct km/h
 *     comparison; the web bug is fixed by deleting its calculator (T-3.4)
 *     and rendering this module's server-computed value instead.
 *  2. `intervals` — the server's legacy switch always returned 0 ("Intervals
 *     умышленно не считаются автоматически"). This port instead uses the
 *     web's existing heuristic (`workout_type === 3` OR the ride's name
 *     matching an interval/tempo/threshold/VO2max/etc. keyword list, in
 *     English or Russian, OR a large max/avg speed ratio at high average
 *     speed) — see docs/audit/layers/04-cross-layer.md §4.2's SPA row.
 *
 * 'health'/'coach' sources are deliberately NOT computed here — see
 * `computeGoalProgress`'s doc comment.
 */

import type { GoalPace } from '../types/goal.js';
import { LEGACY_GOAL_TYPES } from '../constants/goalTypes.js';

export type GoalSourceLike = 'activity' | 'skills' | 'health' | 'coach' | 'manual' | string;

export interface GoalProgressActivityFilter {
  type_in?: string[];
  min_distance?: number;
  max_distance?: number;
  min_elevation_rate?: number;
  max_elevation_rate?: number;
  max_elevation?: number;
  min_speed?: number;
  max_speed?: number;
  min_moving_time?: number;
  name_contains?: string[];
}

export type GoalProgressAggregate = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'count_where' | 'median';

export interface GoalProgressMetric {
  source: GoalSourceLike;
  aggregate?: GoalProgressAggregate;
  field?: string;
  transform?: number;
  filter?: GoalProgressActivityFilter;
  skill?: string;
  health_metric?: string;
}

export interface GoalProgressActivityInput {
  start_date: string;
  distance?: number | null;
  total_elevation_gain?: number | null;
  moving_time?: number | null;
  average_speed?: number | null;
  average_heartrate?: number | null;
  average_cadence?: number | null;
  max_speed?: number | null;
  type?: string | null;
  name?: string | null;
  workout_type?: number | null;
  [key: string]: unknown;
}

export interface GoalProgressUserProfile {
  weight?: number | string | null;
  bike_weight?: number | string | null;
  [key: string]: unknown;
}

export interface GoalProgressInput {
  metric?: GoalProgressMetric | null;
  goal_type?: string | null;
  period?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current_value?: number | string | null;
  target_value?: number | string | null;
  hr_threshold?: number | null;
  duration_threshold?: number | null;
}

export interface GoalProgressContext {
  activities?: GoalProgressActivityInput[];
  skillsSnapshot?: Record<string, number | string | null | undefined> | null;
  userProfile?: GoalProgressUserProfile | null;
  /** Injectable "now", for deterministic tests. Default: `new Date()`. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Activity-source (metric-based model) — server/goalCalculator.js port.
// ---------------------------------------------------------------------------

function applyActivityFilter(
  activities: GoalProgressActivityInput[],
  filter?: GoalProgressActivityFilter,
): GoalProgressActivityInput[] {
  if (!filter) return activities;
  return activities.filter((a) => {
    const dist = a.distance || 0;
    const elev = a.total_elevation_gain || 0;
    const speed = (a.average_speed || 0) * 3.6;
    const elevRate = dist > 0 ? elev / dist : 0;
    const name = (a.name || '').toLowerCase();
    const time = a.moving_time || 0;

    if (filter.type_in && !filter.type_in.includes(a.type || '')) return false;
    if (filter.min_distance && dist < filter.min_distance) return false;
    if (filter.max_distance && dist > filter.max_distance) return false;
    if (filter.min_elevation_rate && elevRate < filter.min_elevation_rate) return false;
    if (filter.max_elevation_rate && elevRate > filter.max_elevation_rate) return false;
    if (filter.max_elevation && elev > filter.max_elevation) return false;
    if (filter.min_speed && speed < filter.min_speed) return false;
    if (filter.max_speed && speed > filter.max_speed) return false;
    if (filter.min_moving_time && time < filter.min_moving_time) return false;
    if (
      filter.name_contains &&
      !filter.name_contains.some((kw) => name.includes(String(kw).toLowerCase()))
    ) {
      return false;
    }
    return true;
  });
}

function calculateActivityProgress(goal: GoalProgressInput, activities: GoalProgressActivityInput[]): number {
  const metric = goal.metric as GoalProgressMetric;
  const start = goal.start_date ? new Date(goal.start_date) : null;
  const end = goal.end_date ? new Date(goal.end_date) : null;

  let filtered = (activities || []).filter((a) => {
    const date = new Date(a.start_date);
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
  filtered = applyActivityFilter(filtered, metric.filter);

  const field = metric.field as string;
  const transform = metric.transform || 1;

  switch (metric.aggregate) {
    case 'sum':
      return filtered.reduce((s, a) => s + (Number(a[field]) || 0), 0) * transform;
    case 'avg': {
      if (filtered.length === 0) return 0;
      const sum = filtered.reduce((s, a) => s + (Number(a[field]) || 0), 0);
      return (sum / filtered.length) * transform;
    }
    case 'max':
      return filtered.length === 0 ? 0 : Math.max(...filtered.map((a) => Number(a[field]) || 0)) * transform;
    case 'min':
      return filtered.length === 0 ? 0 : Math.min(...filtered.map((a) => Number(a[field]) || 0)) * transform;
    case 'count':
    case 'count_where':
      return filtered.length;
    case 'median': {
      if (filtered.length === 0) return 0;
      const values = filtered.map((a) => (Number(a[field]) || 0) * transform).sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }
    default:
      return 0;
  }
}

function calculateSkillsProgress(
  goal: GoalProgressInput,
  skillsSnapshot: Record<string, number | string | null | undefined> | null | undefined,
): number {
  const metric = goal.metric as GoalProgressMetric;
  if (!skillsSnapshot || !metric.skill) return Number(goal.current_value) || 0;
  const value = skillsSnapshot[metric.skill];
  return value != null ? Number(value) : Number(goal.current_value) || 0;
}

// ---------------------------------------------------------------------------
// Legacy fallback (goal.metric IS NULL) — server/server.js's
// `calculateGoalProgress` port, with the `recovery`/`intervals` fixes
// documented in the module header.
// ---------------------------------------------------------------------------

const LEGACY_PERIOD_DAYS: Record<string, number> = {
  '4w': 28,
  '3m': 92,
  year: 365,
  all: Infinity,
};

function filterByLegacyPeriod(
  activities: GoalProgressActivityInput[],
  period: string | null | undefined,
  now: Date,
): GoalProgressActivityInput[] {
  const days: number = (period ? LEGACY_PERIOD_DAYS[period] : undefined) ?? 28;
  if (days === Infinity) return activities;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // Server semantics: `>=` (server/server.js's legacy calculateGoalProgress).
  return activities.filter((a) => new Date(a.start_date) >= startDate);
}

/**
 * `intervals` heuristic — ported from the web's
 * `react-spa/src/utils/goalsCache.js` `calculateGoalProgress` (T-3.4 fix;
 * the server's legacy switch always returned 0 for this case, a known gap
 * per docs/audit/layers/04-cross-layer.md §4.2).
 */
function isLegacyIntervalActivity(a: GoalProgressActivityInput): boolean {
  if (a.type === 'Workout' || a.workout_type === 3) return true;

  const name = (a.name || '').toLowerCase();
  const intervalKeywords = [
    'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
    'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
    'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
    'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid',
  ];
  if (intervalKeywords.some((keyword) => name.includes(keyword))) return true;

  if (a.average_speed && a.max_speed) {
    const avgSpeed = a.average_speed * 3.6;
    const maxSpeed = a.max_speed * 3.6;
    const speedVariation = maxSpeed / avgSpeed;
    if (speedVariation > 1.4 && avgSpeed > 25) return true;
  }
  return false;
}

function calculateAirDensity(temperature: number | null | undefined, elevation: number | null | undefined): number {
  const tempK = temperature ? temperature + 273.15 : 288.15;
  const heightM = elevation || 0;
  const pressureAtHeight = 101325 * Math.exp(-heightM / 7400);
  const R = 287.05;
  return pressureAtHeight / (R * tempK);
}

function calculateAvgPowerLegacy(
  periodActivities: GoalProgressActivityInput[],
  userProfile: GoalProgressUserProfile | null | undefined,
): number {
  const powerActivities = periodActivities.filter((a) => (a.distance || 0) > 1000);
  if (powerActivities.length === 0) return 0;

  const GRAVITY = 9.81;
  const CD_A = 0.4;
  const CRR = 0.005;

  const RIDER_WEIGHT = parseFloat(String(userProfile?.weight)) || 75;
  const BIKE_WEIGHT = parseFloat(String(userProfile?.bike_weight)) || 8;
  const totalWeight = RIDER_WEIGHT + BIKE_WEIGHT;

  const powerValues = powerActivities
    .map((activity) => {
      const distance = parseFloat(String(activity.distance)) || 0;
      const time = parseFloat(String(activity.moving_time)) || 0;
      const elevationGain = parseFloat(String(activity.total_elevation_gain)) || 0;
      const averageSpeed = parseFloat(String(activity.average_speed)) || 0;
      const temperature = activity.average_temp as number | undefined;
      const maxElevation = activity.elev_high as number | undefined;

      const airDensity = calculateAirDensity(temperature, maxElevation);

      if (distance <= 0 || time <= 0 || averageSpeed <= 0) return 0;

      const averageGrade = elevationGain / distance;
      const gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
      const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;
      const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);

      let totalPower = rollingPower + aeroPower + gravityPower;
      if (averageGrade <= 0) {
        const minPowerOnDescent = 20;
        totalPower = Math.max(minPowerOnDescent, totalPower);
      }

      return isNaN(totalPower) || totalPower < 0 || totalPower > 10000 ? 0 : totalPower;
    })
    .filter((power) => power > 0);

  if (powerValues.length === 0) return 0;
  return Math.round(powerValues.reduce((sum, power) => sum + power, 0) / powerValues.length);
}

/**
 * Legacy `goal_type`-switch fallback for goals with `metric == null`
 * (created before the metric-based redesign). Verbatim port of
 * `server/server.js`'s `calculateGoalProgress`, except `recovery` (kept
 * correct, km/h) and `intervals` (fixed — see module header) as documented.
 */
export function calculateLegacyGoalProgress(
  goal: GoalProgressInput,
  activities: GoalProgressActivityInput[],
  userProfile: GoalProgressUserProfile | null = null,
  now: Date = new Date(),
): number {
  const periodActivities = filterByLegacyPeriod(activities, goal.period, now);
  if (periodActivities.length === 0) return 0;

  switch (goal.goal_type) {
    case 'distance': {
      const totalDistance = periodActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
      return parseFloat(totalDistance.toFixed(2));
    }
    case 'elevation': {
      const totalElevation = periodActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
      return Math.round(totalElevation);
    }
    case 'time': {
      const totalTime = periodActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
      return parseFloat(totalTime.toFixed(1));
    }
    case 'long_rides': {
      return periodActivities.filter((a) => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    }
    case 'speed_flat': {
      const flatRides = periodActivities.filter((a) => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && elevation < distance * 0.02 && elevation < 500;
      });
      if (flatRides.length === 0) return 0;
      const speeds = flatRides.map((a) => (a.average_speed || 0) * 3.6);
      const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      return parseFloat(avgSpeed.toFixed(1));
    }
    case 'speed_hills': {
      const hillRides = periodActivities.filter((a) => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        const speed = (a.average_speed || 0) * 3.6;
        return distance > 3000 && (elevation >= distance * 0.015 || elevation >= 500) && speed < 25;
      });
      if (hillRides.length === 0) return 0;
      const hillSpeeds = hillRides.map((a) => (a.average_speed || 0) * 3.6);
      const avgHillSpeed = hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;
      return parseFloat(avgHillSpeed.toFixed(1));
    }
    case 'avg_power':
      return calculateAvgPowerLegacy(periodActivities, userProfile);
    case 'cadence': {
      const activitiesWithCadence = periodActivities.filter((a) => a.average_cadence && a.average_cadence > 0);
      if (activitiesWithCadence.length === 0) return 0;
      const cadenceValues = activitiesWithCadence.map((a) => a.average_cadence || 0);
      return Math.round(cadenceValues.reduce((sum, cadence) => sum + cadence, 0) / cadenceValues.length);
    }
    case 'pulse': {
      const pulseActivities = periodActivities.filter((a) => a.average_heartrate && a.average_heartrate > 0);
      if (pulseActivities.length === 0) return 0;
      const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
      return Math.round(totalPulse / pulseActivities.length);
    }
    case 'avg_hr_flat': {
      const flatPulseActivities = periodActivities.filter((a) => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && elevation < distance * 0.02 && elevation < 500 && a.average_heartrate && a.average_heartrate > 0;
      });
      if (flatPulseActivities.length === 0) return 0;
      const flatAvgHR = flatPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / flatPulseActivities.length;
      return Math.round(flatAvgHR);
    }
    case 'avg_hr_hills': {
      const hillPulseActivities = periodActivities.filter((a) => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && (elevation >= distance * 0.02 || elevation >= 500) && a.average_heartrate && a.average_heartrate > 0;
      });
      if (hillPulseActivities.length === 0) return 0;
      const hillAvgHR = hillPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / hillPulseActivities.length;
      return Math.round(hillAvgHR);
    }
    case 'recovery': {
      // FIX (T-3.4, §4.2): km/h, not m/s — the server's legacy switch always
      // had this right; only the web's copy had the ×3.6 missing bug. See
      // module header for the reconciliation.
      return periodActivities.filter(
        (a) => ['Ride', 'VirtualRide'].includes(a.type || '') && (a.average_speed || 0) * 3.6 < 20,
      ).length;
    }
    case 'intervals':
      // FIX (T-3.4, §4.2): use the web's heuristic instead of always 0.
      return periodActivities.filter(isLegacyIntervalActivity).length;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Universal entry point
// ---------------------------------------------------------------------------

/**
 * Universal goal-progress calculator — computes `current_value` for a goal
 * given the activities/skills/profile context needed for its metric.
 *
 * - `metric.source === 'activity'` -> declarative aggregate over activities
 *   (`calculateActivityProgress`).
 * - `metric.source === 'skills'` -> latest `skills_history` snapshot value.
 * - `metric.source === 'health'` / `'coach'` -> NOT computed here. Apple
 *   Health data is client-only by design (never persisted to Postgres — see
 *   `healthService.ts`/`aiCoach.js`'s `analyze_readiness`), so health-source
 *   goals just pass their stored `current_value` through unchanged; the
 *   CLIENT computes the real value locally via `ctx.health`/`useHealthData()`
 *   instead. 'coach'-source goals are moved by the coach itself via
 *   `update_goal`, not a formula.
 * - `metric == null` (legacy goal) -> `calculateLegacyGoalProgress`.
 */
export function computeGoalProgress(goal: GoalProgressInput, ctx: GoalProgressContext = {}): number {
  const { activities = [], skillsSnapshot = null, userProfile = null, now = new Date() } = ctx;
  const metric = goal.metric;
  if (!metric) {
    // A legacy goal (metric IS NULL) with a goal_type this module doesn't
    // know how to compute (e.g. 'custom' — react-spa's AddGoalModal.jsx's
    // free-text goal option) is MANUAL: the user typed the number in
    // themselves, and there is nothing to recompute it from. Treating it as
    // "compute -> 0" here (the old server behavior, harmless when nothing
    // persisted it) would, now that GET /api/goals writes the computed value
    // back to the row (T-3.4), silently zero out the user's own number —
    // so manual goals pass their stored current_value straight through,
    // same as health/coach below.
    if (goal.goal_type && (LEGACY_GOAL_TYPES as readonly string[]).includes(goal.goal_type)) {
      return calculateLegacyGoalProgress(goal, activities, userProfile, now);
    }
    return Number(goal.current_value) || 0;
  }
  switch (metric.source) {
    case 'activity':
      return calculateActivityProgress(goal, activities);
    case 'skills':
      return calculateSkillsProgress(goal, skillsSnapshot);
    case 'health':
    case 'coach':
      return Number(goal.current_value) || 0;
    default:
      return 0;
  }
}

/**
 * The effective "source" of a goal for write-ownership purposes (not the
 * same as `metric.source`, which is only set for metric-based goals): used
 * by server routes to decide whether a client is allowed to PUT
 * `current_value` directly (`manual`/`health`) or whether it's server/coach
 * -computed and client writes should be ignored (T-3.4).
 */
export function goalProgressSource(goal: GoalProgressInput): GoalSourceLike {
  if (goal.metric?.source) return goal.metric.source;
  if (goal.goal_type && (LEGACY_GOAL_TYPES as readonly string[]).includes(goal.goal_type)) return 'activity';
  return 'manual';
}

/**
 * Pace = how far ahead/behind schedule current_value is, given a linear
 * expectation from start_date to end_date. Returns null for goals without
 * both dates (legacy goals using the old `period` sliding window have no
 * fixed start/end to measure pace against).
 */
export function computePace(
  goal: { start_date?: string | null; end_date?: string | null; target_value?: number | string | null; current_value?: number | string | null },
  currentValue?: number,
  now: Date = new Date(),
): GoalPace | null {
  if (!goal.start_date || !goal.end_date) return null;
  const start = new Date(goal.start_date);
  const end = new Date(goal.end_date);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const daysElapsed = Math.max(0, Math.min(totalDays, (now.getTime() - start.getTime()) / 86400000));
  const daysRemaining = Math.max(0, (end.getTime() - now.getTime()) / 86400000);

  const target = Number(goal.target_value) || 0;
  const expectedValue = target * (daysElapsed / totalDays);
  const actualValue = currentValue !== undefined ? currentValue : Number(goal.current_value) || 0;

  return {
    daysElapsed: Math.round(daysElapsed),
    daysRemaining: Math.round(daysRemaining),
    expectedValue: Math.round(expectedValue * 100) / 100,
    onTrack: actualValue >= expectedValue * 0.85, // 15% tolerance
    percentDelta: expectedValue > 0 ? Math.round(((actualValue - expectedValue) / expectedValue) * 100) : 0,
  };
}
