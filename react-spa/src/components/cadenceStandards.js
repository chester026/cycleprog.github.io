// Cadence reference data for `CadenceStandardsAnalysis.jsx` (T-6.3, audit
// W-32: "thresholds/standards -> constants file"). Pulled out of the
// component so the numbers are named and in one place; nothing here
// duplicates a calc that `@bikelab/shared/calc` provides - there's no
// shared "pro cadence standards" or "workout-type-from-speed" helper, this
// is UI-only reference data specific to this one component.

/** Professional cycling cadence ranges by workout type (rpm). */
export const CADENCE_STANDARDS = {
  timeTrial: { min: 85, max: 95, label: 'Time Trial', color: '#FF6B6B' },
  roadRacing: { min: 80, max: 90, label: 'Road Racing', color: '#4ECDC4' },
  climbing: { min: 70, max: 85, label: 'Climbing', color: '#45B7D1' },
  sprinting: { min: 95, max: 110, label: 'Sprinting', color: '#96CEB4' },
  endurance: { min: 75, max: 85, label: 'Endurance', color: '#FFEAA7' },
};

/** Speed (km/h) / elevation-gain (m) thresholds used to bucket a ride into one of `CADENCE_STANDARDS`. */
export const WORKOUT_TYPE_THRESHOLDS = {
  sprintingSpeedKmh: 35,
  climbingElevationM: 500,
  timeTrialSpeedKmh: 28,
  roadRacingSpeedKmh: 22,
};

export function categorizeWorkout(speedKmh, elevationM) {
  if (speedKmh > WORKOUT_TYPE_THRESHOLDS.sprintingSpeedKmh) return 'sprinting';
  if (elevationM > WORKOUT_TYPE_THRESHOLDS.climbingElevationM) return 'climbing';
  if (speedKmh > WORKOUT_TYPE_THRESHOLDS.timeTrialSpeedKmh) return 'timeTrial';
  if (speedKmh > WORKOUT_TYPE_THRESHOLDS.roadRacingSpeedKmh) return 'roadRacing';
  return 'endurance';
}

/** How far (as a fraction of the standard's rpm range) the user's average may deviate from the standard's midpoint. */
export const EFFICIENCY_DEVIATION_THRESHOLDS = {
  excellent: 0.2,
  good: 0.4,
  average: 0.6,
};

export function getEfficiencyScore(userCadence, standard) {
  const standardAvg = (standard.min + standard.max) / 2;
  const deviation = Math.abs(userCadence - standardAvg);
  const range = standard.max - standard.min;

  if (deviation <= range * EFFICIENCY_DEVIATION_THRESHOLDS.excellent) return { score: 'Excellent', color: '#4CAF50' };
  if (deviation <= range * EFFICIENCY_DEVIATION_THRESHOLDS.good) return { score: 'Good', color: '#8BC34A' };
  if (deviation <= range * EFFICIENCY_DEVIATION_THRESHOLDS.average) return { score: 'Average', color: '#FFC107' };
  return { score: 'Needs Improvement', color: '#F44336' };
}
