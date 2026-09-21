/**
 * Enum-ish constants for the declarative goal-metric system (T-2.2, T-2.4,
 * docs/audit/layers/04-cross-layer.md §4.9, §6.1).
 *
 * Single source of truth: mirrors `server/goalCalculator.js`'s former
 * VALID_SOURCES/VALID_AGGREGATES/VALID_FIELDS/VALID_SKILLS/
 * VALID_HEALTH_METRICS verbatim — `server/goalCalculator.js` now imports
 * these from `@bikelab/shared/constants` instead of redeclaring them (T-2.4).
 */
export const VALID_SOURCES = ['activity', 'skills', 'health', 'coach'] as const;
export type GoalSource = (typeof VALID_SOURCES)[number];

export const VALID_AGGREGATES = [
  'sum',
  'avg',
  'max',
  'min',
  'count',
  'count_where',
  'median',
] as const;
export type GoalAggregate = (typeof VALID_AGGREGATES)[number];

export const VALID_FIELDS = [
  'distance',
  'total_elevation_gain',
  'moving_time',
  'average_speed',
  'average_heartrate',
  'average_cadence',
  'average_watts',
  'max_speed',
] as const;
export type GoalMetricField = (typeof VALID_FIELDS)[number];

export const VALID_SKILLS = [
  'climbing',
  'sprint',
  'endurance',
  'tempo',
  'power',
  'consistency',
] as const;
export type GoalSkill = (typeof VALID_SKILLS)[number];

export const VALID_HEALTH_METRICS = ['hrv', 'resting_hr', 'sleep_hours', 'weight'] as const;
export type GoalHealthMetric = (typeof VALID_HEALTH_METRICS)[number];

export const GOAL_PERIODS = ['4w', '3m', 'year', 'all'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const META_GOAL_TIERS = ['legendary', 'epic', 'grand', 'base'] as const;
export type MetaGoalTier = (typeof META_GOAL_TIERS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const CALENDAR_EVENT_TYPES = [
  'planned_ride',
  'rest_day',
  'maintenance',
  'purchase',
  'event',
  'note',
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

/**
 * Legacy (pre-redesign) `goal_type` enum — only used as a fallback for
 * goals with no `goal.title`/`goal.unit` of their own (see
 * md/GOALS_REDESIGN_PLAN_FINAL.md). Reconciles the identical
 * GOAL_TYPE_LABELS/GOAL_TYPE_UNITS maps in
 * `react-spa/src/pages/GoalDetailPage.jsx` and the i18n-keyed equivalents in
 * `BikeLabApp/src/screens/GoalDetailsScreen.tsx` (T-2.4, §6.1).
 *
 * The web has no i18n layer, so `GOAL_TYPE_LABELS`/`GOAL_TYPE_UNITS` here are
 * the plain English strings it renders directly via `getGoalTypeLabel`/
 * `getGoalUnit`. The app still renders translated strings through
 * `useTranslation()`, so it keeps its own `getGoalTypeLabel`/`getGoalUnit`
 * wrappers but now sources the goal-type -> i18n-key mapping from
 * `GOAL_TYPE_I18N_KEYS` below instead of redeclaring the enum.
 *
 * `AddGoalModal.jsx`'s `GOAL_TYPES` is a related but *not* identical
 * dataset (different label text/casing, an extra `custom` entry and
 * `avg_hr_flat`/`avg_hr_hills` options that don't exist here) — left alone,
 * see the T-2.4 report.
 */
export const LEGACY_GOAL_TYPES = [
  'distance',
  'elevation',
  'time',
  'speed_flat',
  'speed_hills',
  'long_rides',
  'intervals',
  'pulse',
  'cadence',
  'avg_power',
  'ftp_vo2max',
  'recovery',
] as const;
export type LegacyGoalType = (typeof LEGACY_GOAL_TYPES)[number];

/**
 * The subset of `goal_type`s `calculateLegacyGoalProgress` actually has a
 * case for — i.e. the legacy goals whose `current_value` the server can
 * recompute from activities. NOT the same list as `LEGACY_GOAL_TYPES`
 * above, which exists to label/unit a goal in the UI, and the difference
 * is load-bearing:
 *  - `ftp_vo2max` is labelled but NOT computable (its value comes from the
 *    `vo2max_value` flow / POST /api/goals/recalc-vo2max). Gating on the
 *    labels list made it "activity"-sourced, so the calculator's `default:
 *    return 0` zeroed it and GET /api/goals persisted that zero over the
 *    real number on every read.
 *  - `avg_hr_flat`/`avg_hr_hills` are computable but were never in the
 *    labels list (the web's AddGoalModal creates them), so they were
 *    classified `manual` and their value was passed through unchanged
 *    forever — rides never moved them.
 * Anything outside this list with `metric IS NULL` is manual: the user
 * typed the number in and there is nothing to recompute it from.
 */
export const COMPUTABLE_LEGACY_GOAL_TYPES = [
  'distance',
  'elevation',
  'time',
  'speed_flat',
  'speed_hills',
  'long_rides',
  'intervals',
  'pulse',
  'cadence',
  'avg_hr_flat',
  'avg_hr_hills',
  'avg_power',
  'recovery',
] as const;
export type ComputableLegacyGoalType = (typeof COMPUTABLE_LEGACY_GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<LegacyGoalType, string> = {
  distance: 'Distance',
  elevation: 'Elevation',
  time: 'Time',
  speed_flat: 'Speed (Flat)',
  speed_hills: 'Speed (Hills)',
  long_rides: 'Long Rides',
  intervals: 'Intervals',
  pulse: 'Average HR',
  cadence: 'Cadence',
  avg_power: 'Average Power',
  ftp_vo2max: 'FTP/VO2max',
  recovery: 'Recovery Rides',
};

export const GOAL_TYPE_UNITS: Record<LegacyGoalType, string> = {
  distance: 'km',
  elevation: 'm',
  time: 'hours',
  speed_flat: 'km/h',
  speed_hills: 'km/h',
  long_rides: 'rides',
  intervals: 'Workouts',
  pulse: 'bpm',
  cadence: 'rpm',
  avg_power: 'W',
  ftp_vo2max: 'min',
  recovery: 'rides',
};

/** goal_type -> the i18next keys `BikeLabApp/src/screens/GoalDetailsScreen.tsx` looks up. */
export const GOAL_TYPE_I18N_KEYS: Record<LegacyGoalType, { labelKey: string; unitKey: string }> = {
  distance: { labelKey: 'goalDetails.metricDistance', unitKey: 'common.km' },
  elevation: { labelKey: 'goalDetails.metricElevation', unitKey: 'common.m' },
  time: { labelKey: 'goalDetails.metricTime', unitKey: 'common.hours' },
  speed_flat: { labelKey: 'goalDetails.metricSpeedFlat', unitKey: 'common.kmh' },
  speed_hills: { labelKey: 'goalDetails.metricSpeedHills', unitKey: 'common.kmh' },
  long_rides: { labelKey: 'goalDetails.metricLongRides', unitKey: 'common.rides' },
  intervals: { labelKey: 'goalDetails.metricIntervals', unitKey: 'analysis.workouts' },
  pulse: { labelKey: 'goalDetails.metricAvgHR', unitKey: 'common.bpm' },
  cadence: { labelKey: 'goalDetails.metricCadence', unitKey: 'common.rpm' },
  avg_power: { labelKey: 'goalDetails.metricAvgPower', unitKey: 'common.watts' },
  ftp_vo2max: { labelKey: 'goalDetails.metricFTP', unitKey: 'common.min' },
  recovery: { labelKey: 'goalDetails.metricRecovery', unitKey: 'common.rides' },
};

function isLegacyGoalType(goalType: string): goalType is LegacyGoalType {
  return (LEGACY_GOAL_TYPES as readonly string[]).includes(goalType);
}

/** English label for a legacy `goal_type`, falling back to the raw value. */
export function getGoalTypeLabel(goalType: string): string {
  return isLegacyGoalType(goalType) ? GOAL_TYPE_LABELS[goalType] : goalType;
}

/** English unit for a legacy `goal_type`, falling back to `''`. */
export function getGoalUnit(goalType: string): string {
  return isLegacyGoalType(goalType) ? GOAL_TYPE_UNITS[goalType] : '';
}

/**
 * Meta-goal tier styling, reconciling `react-spa/src/pages/GoalDetailPage.jsx`'s
 * `TIER_CONFIG`, `BikeLabApp/src/components/MetaGoalCard.tsx`'s and
 * `BikeLabApp/src/screens/GoalDetailsScreen.tsx`'s (T-2.4, §6.1). All three
 * agree on `legendary`/`epic`/`grand`'s colors; `base` differed
 * (`MetaGoalCard.tsx` used `#F0F0F0`, the other two `#ccc` — the 2-of-3
 * majority, and the one this module standardizes on; see the T-2.4 report).
 * `label` is the web's plain-English string; `key` is the app's i18next key.
 */
export const TIER_CONFIG: Record<MetaGoalTier, { color: string; label: string; key: string }> = {
  legendary: { color: '#FC5200', label: 'Legendary', key: 'goalTier.legendary' },
  epic: { color: '#8B5CF6', label: 'Epic', key: 'goalTier.epic' },
  grand: { color: '#274dd3', label: 'Grand', key: 'goalTier.grand' },
  base: { color: '#ccc', label: 'Base', key: 'goalTier.base' },
};
