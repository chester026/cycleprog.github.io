// server/goalCalculator.js
//
// Universal declarative goal-progress calculator — see
// md/GOALS_REDESIGN_PLAN_FINAL.md and BikeLabApp/GOALS_REDESIGN_SPEC.md.
// Replaces the old switch(goal.goal_type) enum: new sub-goals describe HOW
// to measure themselves via a `metric` JSONB column instead of picking from
// a hardcoded list, so any trackable-0-100% goal can be created without
// touching this file. Legacy goals (metric IS NULL) fall back to the old
// switch/case in server.js, still exported there as calculateGoalProgress —
// pass it in as `legacyCalculator` rather than requiring server.js here
// (server.js requires this file; requiring back would be circular).
//
// IMPORTANT — 'health' source is deliberately NOT computed here. Apple
// Health data in this app is client-only by design: healthContext is built
// on-device and never persisted to Postgres (see healthService.ts /
// aiCoach.js's analyze_readiness for why). The server has no way to hold a
// fresh HRV/resting-HR/sleep snapshot in the background, so health-source
// goals just pass their stored current_value through unchanged here — the
// CLIENT computes the real value locally from useHealthData() instead (see
// the plan doc §2.1). Same story for 'coach' source: the coach moves
// current_value itself via update_goal based on judgment, not a formula.

const VALID_SOURCES = ['activity', 'skills', 'health', 'coach'];
const VALID_AGGREGATES = ['sum', 'avg', 'max', 'min', 'count', 'count_where', 'median'];
const VALID_FIELDS = [
  'distance', 'total_elevation_gain', 'moving_time',
  'average_speed', 'average_heartrate', 'average_cadence',
  'average_watts', 'max_speed',
];
const VALID_SKILLS = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];
const VALID_HEALTH_METRICS = ['hrv', 'resting_hr', 'sleep_hours', 'weight'];

function validateMetric(metric) {
  if (!metric || typeof metric !== 'object') return false;
  if (!VALID_SOURCES.includes(metric.source)) return false;

  if (metric.source === 'activity') {
    if (!VALID_AGGREGATES.includes(metric.aggregate)) return false;
    const needsField = metric.aggregate !== 'count' && metric.aggregate !== 'count_where';
    if (needsField && !metric.field) return false;
    if (metric.field && !VALID_FIELDS.includes(metric.field)) return false;
  }
  if (metric.source === 'skills' && !VALID_SKILLS.includes(metric.skill)) return false;
  if (metric.source === 'health' && !VALID_HEALTH_METRICS.includes(metric.health_metric)) return false;
  // 'coach' source needs no extra fields.
  return true;
}

function applyActivityFilter(activities, filter) {
  if (!filter) return activities;
  return activities.filter((a) => {
    const dist = a.distance || 0;
    const elev = a.total_elevation_gain || 0;
    const speed = (a.average_speed || 0) * 3.6;
    const elevRate = dist > 0 ? elev / dist : 0;
    const name = (a.name || '').toLowerCase();
    const time = a.moving_time || 0;

    if (filter.type_in && !filter.type_in.includes(a.type)) return false;
    if (filter.min_distance && dist < filter.min_distance) return false;
    if (filter.max_distance && dist > filter.max_distance) return false;
    if (filter.min_elevation_rate && elevRate < filter.min_elevation_rate) return false;
    if (filter.max_elevation_rate && elevRate > filter.max_elevation_rate) return false;
    if (filter.max_elevation && elev > filter.max_elevation) return false;
    if (filter.min_speed && speed < filter.min_speed) return false;
    if (filter.max_speed && speed > filter.max_speed) return false;
    if (filter.min_moving_time && time < filter.min_moving_time) return false;
    if (filter.name_contains && !filter.name_contains.some((kw) => name.includes(String(kw).toLowerCase()))) return false;
    return true;
  });
}

function calculateActivityProgress(goal, activities) {
  const metric = goal.metric;
  const start = goal.start_date ? new Date(goal.start_date) : null;
  const end = goal.end_date ? new Date(goal.end_date) : null;

  let filtered = (activities || []).filter((a) => {
    const date = new Date(a.start_date);
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
  filtered = applyActivityFilter(filtered, metric.filter);

  const field = metric.field;
  const transform = metric.transform || 1;

  switch (metric.aggregate) {
    case 'sum':
      return filtered.reduce((s, a) => s + (a[field] || 0), 0) * transform;
    case 'avg': {
      if (filtered.length === 0) return 0;
      const sum = filtered.reduce((s, a) => s + (a[field] || 0), 0);
      return (sum / filtered.length) * transform;
    }
    case 'max':
      return filtered.length === 0 ? 0 : Math.max(...filtered.map((a) => a[field] || 0)) * transform;
    case 'min':
      return filtered.length === 0 ? 0 : Math.min(...filtered.map((a) => a[field] || 0)) * transform;
    case 'count':
    case 'count_where':
      return filtered.length;
    case 'median': {
      if (filtered.length === 0) return 0;
      const values = filtered.map((a) => (a[field] || 0) * transform).sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }
    default:
      return 0;
  }
}

function calculateSkillsProgress(goal, skillsSnapshot) {
  if (!skillsSnapshot || !goal.metric.skill) return goal.current_value || 0;
  const value = skillsSnapshot[goal.metric.skill];
  return value != null ? Number(value) : (goal.current_value || 0);
}

/**
 * Universal entry point.
 * @param {object} goal - a `goals` row; needs `metric` (JSONB, may be null
 *   for legacy goals), `start_date`/`end_date` (for activity-source), and
 *   `current_value` (fallback for coach/health source).
 * @param {object} ctx
 * @param {object[]} ctx.activities
 * @param {object|null} ctx.skillsSnapshot - latest skills_history row
 * @param {object|null} ctx.userProfile
 * @param {Function} [ctx.legacyCalculator] - server.js's old
 *   calculateGoalProgress(goal, activities, userProfile), used when
 *   goal.metric is null (pre-redesign goals).
 */
function calculateProgress(goal, ctx = {}) {
  const { activities = [], skillsSnapshot = null, legacyCalculator, userProfile = null } = ctx;
  const metric = goal.metric;
  if (!metric) {
    return legacyCalculator ? legacyCalculator(goal, activities, userProfile) : (Number(goal.current_value) || 0);
  }
  switch (metric.source) {
    case 'activity':
      return calculateActivityProgress(goal, activities);
    case 'skills':
      return calculateSkillsProgress(goal, skillsSnapshot);
    case 'health':
    case 'coach':
      // Deliberately not computed server-side — see file header.
      return Number(goal.current_value) || 0;
    default:
      return 0;
  }
}

/**
 * Pace = how far ahead/behind schedule current_value is, given a linear
 * expectation from start_date to end_date. Returns null for goals without
 * both dates (legacy goals using the old `period` sliding window have no
 * fixed start/end to measure pace against).
 */
function addPaceData(goal) {
  if (!goal.start_date || !goal.end_date) return null;
  const start = new Date(goal.start_date);
  const end = new Date(goal.end_date);
  const now = new Date();
  const totalDays = Math.max(1, (end - start) / 86400000);
  const daysElapsed = Math.max(0, Math.min(totalDays, (now - start) / 86400000));
  const daysRemaining = Math.max(0, (end - now) / 86400000);

  const target = Number(goal.target_value) || 0;
  const expectedValue = target * (daysElapsed / totalDays);
  const actualValue = Number(goal.current_value) || 0;

  return {
    daysElapsed: Math.round(daysElapsed),
    daysRemaining: Math.round(daysRemaining),
    expectedValue: Math.round(expectedValue * 100) / 100,
    onTrack: actualValue >= expectedValue * 0.85, // 15% tolerance
    percentDelta: expectedValue > 0 ? Math.round(((actualValue - expectedValue) / expectedValue) * 100) : 0,
  };
}

module.exports = {
  calculateProgress,
  addPaceData,
  validateMetric,
  VALID_SOURCES,
  VALID_AGGREGATES,
  VALID_FIELDS,
  VALID_SKILLS,
  VALID_HEALTH_METRICS,
};
