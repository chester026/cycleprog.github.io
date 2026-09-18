// server/goalCalculator.js
//
// Thin CJS wrapper around @bikelab/shared/calc's `computeGoalProgress`/
// `computePace` (T-3.4, docs/audit/00-AUDIT-AND-PLAN.md T-3.4,
// docs/audit/layers/04-cross-layer.md §4.2). Both the metric-based model
// (source/aggregate/field/filter, for goals created after the redesign) AND
// the legacy goal_type/period switch (for goals with `metric IS NULL`,
// created before it) now live in packages/shared/src/calc/goalProgress.ts —
// the server no longer carries its own copy of the legacy switch
// (server.js's old `calculateGoalProgress` was deleted; it used to be
// passed in here as `legacyCalculator`).
//
// Kept as a separate file (rather than requiring '@bikelab/shared/calc'
// directly from server.js) so existing `require('./goalCalculator')` call
// sites and tests don't need touching, and so `validateMetric` +
// VALID_SOURCES/etc. stay available from the same module they always were.
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

// VALID_SOURCES/VALID_AGGREGATES/VALID_FIELDS/VALID_SKILLS/
// VALID_HEALTH_METRICS moved to @bikelab/shared/constants (T-2.4,
// docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §4.9/§6.1) — single source of truth shared with the goalTypes.ts
// constants that back the client-side goal UI.
const {
  VALID_SOURCES,
  VALID_AGGREGATES,
  VALID_FIELDS,
  VALID_SKILLS,
  VALID_HEALTH_METRICS,
} = require('@bikelab/shared/constants');
const { computeGoalProgress, computePace, goalProgressSource } = require('@bikelab/shared/calc');

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

/**
 * Universal entry point.
 * @param {object} goal - a `goals` row; needs `metric` (JSONB, may be null
 *   for legacy goals), `start_date`/`end_date` (for activity-source), and
 *   `current_value` (fallback for coach/health source).
 * @param {object} ctx
 * @param {object[]} ctx.activities
 * @param {object|null} ctx.skillsSnapshot - latest skills_history row
 * @param {object|null} ctx.userProfile
 */
function calculateProgress(goal, ctx = {}) {
  return computeGoalProgress(goal, ctx);
}

/**
 * Pace = how far ahead/behind schedule current_value is, given a linear
 * expectation from start_date to end_date. Returns null for goals without
 * both dates (legacy goals using the old `period` sliding window have no
 * fixed start/end to measure pace against).
 */
function addPaceData(goal) {
  return computePace(goal, Number(goal.current_value) || 0);
}

module.exports = {
  calculateProgress,
  addPaceData,
  validateMetric,
  goalProgressSource,
  VALID_SOURCES,
  VALID_AGGREGATES,
  VALID_FIELDS,
  VALID_SKILLS,
  VALID_HEALTH_METRICS,
};
