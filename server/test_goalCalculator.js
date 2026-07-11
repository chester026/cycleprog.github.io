// server/test_goalCalculator.js
//
// Assert-based smoke test for the universal declarative goal calculator
// (server/goalCalculator.js). Pure functions, no DB/network — run with:
//   node server/test_goalCalculator.js
//
// Covers: validateMetric (all 4 sources, valid + invalid shapes),
// calculateProgress for activity/skills/health/coach sources + legacy
// fallback, and addPaceData (on-track/behind/ahead/no-dates).

const assert = require('assert');
const {
  calculateProgress,
  addPaceData,
  validateMetric,
} = require('./goalCalculator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// validateMetric
// ---------------------------------------------------------------------------

test('validateMetric: valid activity metric (sum + field)', () => {
  assert.strictEqual(
    validateMetric({source: 'activity', aggregate: 'sum', field: 'distance'}),
    true
  );
});

test('validateMetric: valid activity metric (count, no field needed)', () => {
  assert.strictEqual(validateMetric({source: 'activity', aggregate: 'count'}), true);
});

test('validateMetric: invalid activity metric — missing field for sum', () => {
  assert.strictEqual(validateMetric({source: 'activity', aggregate: 'sum'}), false);
});

test('validateMetric: invalid activity metric — bad aggregate', () => {
  assert.strictEqual(
    validateMetric({source: 'activity', aggregate: 'total', field: 'distance'}),
    false
  );
});

test('validateMetric: invalid activity metric — unknown field', () => {
  assert.strictEqual(
    validateMetric({source: 'activity', aggregate: 'sum', field: 'ftp'}),
    false
  );
});

test('validateMetric: valid skills metric', () => {
  assert.strictEqual(validateMetric({source: 'skills', skill: 'climbing'}), true);
});

test('validateMetric: invalid skills metric — unknown skill', () => {
  assert.strictEqual(validateMetric({source: 'skills', skill: 'discipline'}), false);
});

test('validateMetric: valid health metric', () => {
  assert.strictEqual(validateMetric({source: 'health', health_metric: 'hrv'}), true);
});

test('validateMetric: invalid health metric — unknown health_metric', () => {
  assert.strictEqual(validateMetric({source: 'health', health_metric: 'vo2max'}), false);
});

test('validateMetric: valid coach metric — no extra fields needed', () => {
  assert.strictEqual(validateMetric({source: 'coach'}), true);
});

test('validateMetric: invalid — unknown source', () => {
  assert.strictEqual(validateMetric({source: 'strava'}), false);
});

test('validateMetric: invalid — null/non-object', () => {
  assert.strictEqual(validateMetric(null), false);
  assert.strictEqual(validateMetric('activity'), false);
});

// ---------------------------------------------------------------------------
// calculateProgress — activity source
// ---------------------------------------------------------------------------

const activities = [
  {start_date: '2026-06-01', distance: 30000, total_elevation_gain: 200, average_speed: 8, type: 'Ride', name: 'Flat spin'},
  {start_date: '2026-06-10', distance: 60000, total_elevation_gain: 1200, average_speed: 6, type: 'Ride', name: 'Climbing day'},
  {start_date: '2026-06-20', distance: 45000, total_elevation_gain: 300, average_speed: 7.5, type: 'Ride', name: 'Zwift interval session'},
  {start_date: '2025-01-01', distance: 100000, total_elevation_gain: 500, average_speed: 9, type: 'Ride', name: 'Out of range'},
];

test('calculateProgress: activity sum(distance) within date range, transform to km', () => {
  const goal = {
    metric: {source: 'activity', aggregate: 'sum', field: 'distance', transform: 0.001},
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  };
  // 30000 + 60000 + 45000 = 135000m -> 135km (2026-01-01 activity excluded by date)
  assert.strictEqual(calculateProgress(goal, {activities}), 135);
});

test('calculateProgress: activity avg(average_speed)', () => {
  const goal = {
    metric: {source: 'activity', aggregate: 'avg', field: 'average_speed'},
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  };
  const expected = (8 + 6 + 7.5) / 3;
  assert.strictEqual(calculateProgress(goal, {activities}), expected);
});

test('calculateProgress: activity count with filter (name_contains)', () => {
  const goal = {
    metric: {source: 'activity', aggregate: 'count', filter: {name_contains: ['interval']}},
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  };
  assert.strictEqual(calculateProgress(goal, {activities}), 1);
});

test('calculateProgress: activity sum(elevation) with min_elevation_rate filter (climbing rides only)', () => {
  const goal = {
    metric: {
      source: 'activity',
      aggregate: 'sum',
      field: 'total_elevation_gain',
      filter: {min_elevation_rate: 0.015}, // 15m/km — only the "Climbing day" ride qualifies (1200/60000=0.02)
    },
    start_date: '2026-06-01',
    end_date: '2026-06-30',
  };
  assert.strictEqual(calculateProgress(goal, {activities}), 1200);
});

test('calculateProgress: activity source, no activities in range -> 0', () => {
  const goal = {
    metric: {source: 'activity', aggregate: 'sum', field: 'distance'},
    start_date: '2030-01-01',
    end_date: '2030-01-31',
  };
  assert.strictEqual(calculateProgress(goal, {activities}), 0);
});

// ---------------------------------------------------------------------------
// calculateProgress — skills source
// ---------------------------------------------------------------------------

test('calculateProgress: skills source reads the matching column from snapshot', () => {
  const goal = {metric: {source: 'skills', skill: 'climbing'}};
  const skillsSnapshot = {climbing: 72, sprint: 55, endurance: 80, tempo: 60, power: 65, consistency: 90};
  assert.strictEqual(calculateProgress(goal, {skillsSnapshot}), 72);
});

test('calculateProgress: skills source with no snapshot falls back to current_value', () => {
  const goal = {metric: {source: 'skills', skill: 'climbing'}, current_value: 40};
  assert.strictEqual(calculateProgress(goal, {skillsSnapshot: null}), 40);
});

// ---------------------------------------------------------------------------
// calculateProgress — health / coach sources (deliberately pass-through)
// ---------------------------------------------------------------------------

test('calculateProgress: health source passes current_value through unchanged (never computed server-side)', () => {
  const goal = {metric: {source: 'health', health_metric: 'hrv'}, current_value: 55};
  // Even with activities/skills provided, health source must ignore them.
  assert.strictEqual(calculateProgress(goal, {activities, skillsSnapshot: {climbing: 99}}), 55);
});

test('calculateProgress: coach source passes current_value through unchanged', () => {
  const goal = {metric: {source: 'coach'}, current_value: 63};
  assert.strictEqual(calculateProgress(goal, {activities}), 63);
});

// ---------------------------------------------------------------------------
// calculateProgress — legacy fallback (metric IS NULL)
// ---------------------------------------------------------------------------

test('calculateProgress: legacy goal (metric null) delegates to legacyCalculator', () => {
  const goal = {metric: null, goal_type: 'distance', period: '4w', current_value: 0};
  let calledWith = null;
  const legacyCalculator = (g, acts, profile) => {
    calledWith = {g, acts, profile};
    return 123;
  };
  const result = calculateProgress(goal, {activities, userProfile: {ftp: 250}, legacyCalculator});
  assert.strictEqual(result, 123);
  assert.strictEqual(calledWith.g, goal);
  assert.deepStrictEqual(calledWith.acts, activities);
  assert.deepStrictEqual(calledWith.profile, {ftp: 250});
});

test('calculateProgress: legacy goal with no legacyCalculator provided falls back to stored current_value', () => {
  const goal = {metric: null, current_value: '17.5'};
  assert.strictEqual(calculateProgress(goal, {}), 17.5);
});

// ---------------------------------------------------------------------------
// addPaceData
// ---------------------------------------------------------------------------

test('addPaceData: on track (actual within 15% tolerance of expected)', () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  // Halfway through a 20-day window, target 100 -> expected ~50. actual=48
  // stays inside the 85% tolerance band regardless of date-truncation
  // rounding at midnight (start_date/end_date have no time-of-day).
  const goal = {start_date: start, end_date: end, target_value: 100, current_value: 48};
  const pace = addPaceData(goal);
  assert.ok(pace);
  assert.strictEqual(pace.onTrack, true);
});

test('addPaceData: behind schedule (actual well under 85% of expected)', () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  const goal = {start_date: start, end_date: end, target_value: 100, current_value: 20};
  const pace = addPaceData(goal);
  assert.ok(pace);
  assert.strictEqual(pace.onTrack, false);
  assert.ok(pace.percentDelta < 0, `expected negative percentDelta, got ${pace.percentDelta}`);
});

test('addPaceData: ahead of schedule (actual over expected)', () => {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
  const goal = {start_date: start, end_date: end, target_value: 100, current_value: 80};
  const pace = addPaceData(goal);
  assert.ok(pace);
  assert.strictEqual(pace.onTrack, true);
  assert.ok(pace.percentDelta > 0, `expected positive percentDelta, got ${pace.percentDelta}`);
});

test('addPaceData: returns null when start_date/end_date missing (legacy sliding-window goal)', () => {
  assert.strictEqual(addPaceData({target_value: 100, current_value: 50}), null);
  assert.strictEqual(addPaceData({start_date: '2026-01-01', target_value: 100, current_value: 50}), null);
});

// ---------------------------------------------------------------------------
// Lifecycle flags — mirrors the exact expressions in aiCoach.js's
// get_goals_progress and server.js's GET /api/meta-goals/:id (not exported
// from goalCalculator.js, so reproduced here verbatim to pin the contract).
// ---------------------------------------------------------------------------

function computeLifecycleFlags(subGoals, metaGoal) {
  const readyToComplete =
    subGoals.length > 0 &&
    subGoals.every((g) => g.current >= g.target * 0.98) &&
    metaGoal.status === 'active';
  const expired =
    !!metaGoal.target_date && new Date(metaGoal.target_date) < new Date() && metaGoal.status === 'active';
  const overachieving = subGoals.some((g) => g.current > g.target * 1.3);
  return {readyToComplete, expired, overachieving};
}

test('lifecycle: readyToComplete true at 98% (not requiring exactly 100%)', () => {
  const subGoals = [{current: 393, target: 400}]; // 98.25%
  const flags = computeLifecycleFlags(subGoals, {status: 'active'});
  assert.strictEqual(flags.readyToComplete, true);
});

test('lifecycle: readyToComplete false just under 98%', () => {
  const subGoals = [{current: 390, target: 400}]; // 97.5%
  const flags = computeLifecycleFlags(subGoals, {status: 'active'});
  assert.strictEqual(flags.readyToComplete, false);
});

test('lifecycle: readyToComplete false if meta-goal already completed', () => {
  const subGoals = [{current: 400, target: 400}];
  const flags = computeLifecycleFlags(subGoals, {status: 'completed'});
  assert.strictEqual(flags.readyToComplete, false);
});

test('lifecycle: expired true when target_date is in the past and still active', () => {
  const flags = computeLifecycleFlags([{current: 10, target: 100}], {
    status: 'active',
    target_date: '2020-01-01',
  });
  assert.strictEqual(flags.expired, true);
});

test('lifecycle: overachieving true when any sub-goal exceeds 130% of target', () => {
  const flags = computeLifecycleFlags(
    [{current: 50, target: 100}, {current: 140, target: 100}],
    {status: 'active'}
  );
  assert.strictEqual(flags.overachieving, true);
});

test('lifecycle: overachieving false when no sub-goal exceeds 130%', () => {
  const flags = computeLifecycleFlags([{current: 125, target: 100}], {status: 'active'});
  assert.strictEqual(flags.overachieving, false);
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
