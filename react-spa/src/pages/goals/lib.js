// Pure helpers behind GoalAssistantPage/GoalDetailPage's decomposed pieces
// (T-6.3 part 2). No React, no `apiFetch` — everything here is a plain
// function so it is unit-testable without rendering, and so the numbers it
// produces are visibly just a reshuffle of server-computed fields, never a
// second computation of progress (audit W-08: "прогресс целей считается в
// браузере" — every `percent`/`current_value`/`pace` value below is read
// off a goal row exactly as `GET /api/meta-goals[/:id]` sent it).

// --- AiGoalGenerator -------------------------------------------------

// Client-side relevance check before spending an AI call (moved verbatim
// from GoalAssistantPage.jsx's `isRelevantToCycling`).
const CYCLING_KEYWORDS = [
  'bike', 'cycling', 'ride', 'fondo', 'км', 'km', 'distance', 'велосипед',
  'ftp', 'vo2', 'power', 'watts', 'cadence', 'speed', 'climb', 'elevation',
  'hill', 'training', 'workout', 'endurance', 'fitness', 'race', 'event',
  'competition', 'gran fondo', 'century', 'brevet', 'sportive', 'pedal',
  'грандфондо', 'тренировка', 'заезд', 'гонка', 'выносливость', 'дистанция',
  'подъем', 'спуск', 'heart rate', 'hr', 'pulse', 'пульс', 'tempo', 'interval',
  'recovery', 'base', 'threshold', 'zone', 'improve', 'prepare', 'build',
];

const IRRELEVANT_KEYWORDS = [
  'cook', 'recipe', 'food', 'meal', 'пельмени', 'готовить', 'рецепт', 'еда',
  'program', 'code', 'python', 'javascript', 'программ', 'сайт',
  'movie', 'film', 'book', 'music', 'фильм', 'книга', 'музыка',
  'weather', 'погода', 'news', 'новости', 'варить', 'жарить',
];

export function isRelevantToCycling(text) {
  const lowerText = (text || '').toLowerCase();
  const hasIrrelevant = IRRELEVANT_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  if (hasIrrelevant) return false;
  return CYCLING_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

// --- GoalForm — goal-type/period option lists -------------------------
export const GOAL_TYPES = [
  { value: 'distance', label: 'Distance (km)', unit: 'km' },
  { value: 'elevation', label: 'Elevation Gain (m)', unit: 'm' },
  { value: 'time', label: 'Moving Time (hours)', unit: 'h' },
  { value: 'speed_flat', label: 'Average Speed on Flat (km/h)', unit: 'km/h' },
  { value: 'speed_hills', label: 'Average Speed on Hills (km/h)', unit: 'km/h' },
  { value: 'pulse', label: 'Average Heart Rate (bpm)', unit: 'bpm' },
  { value: 'avg_hr_flat', label: 'Average HR Flat (bpm)', unit: 'bpm' },
  { value: 'avg_hr_hills', label: 'Average HR Hills (bpm)', unit: 'bpm' },
  { value: 'avg_power', label: 'Average Power (W)', unit: 'W' },
  { value: 'cadence', label: 'Average Cadence (RPM)', unit: 'RPM' },
  { value: 'long_rides', label: 'Long Rides Count', unit: 'rides' },
  { value: 'intervals', label: 'Interval Workouts', unit: 'workouts' },
  { value: 'recovery', label: 'Recovery Rides', unit: 'rides' },
  { value: 'custom', label: 'Custom Goal', unit: '' },
];

export const PERIODS = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];

// --- SubGoalsTable — classifying a sub-goal into a board column ------
//
// Moved verbatim from GoalDetailPage.jsx (see its original comment for the
// full rationale): metric.skill first, then metric.field, then a count-style
// distance filter, then a title/description keyword match, then the legacy
// goal_type enum, "other" last.
export const SKILL_GROUPS = [
  { key: 'climbing', label: 'Climbing' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'power', label: 'Power' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'other', label: 'Other' },
];

const METRIC_FIELD_TO_SKILL = {
  total_elevation_gain: 'climbing',
  average_speed: 'sprint',
  max_speed: 'sprint',
  average_watts: 'power',
  distance: 'endurance',
  moving_time: 'endurance',
};

const TITLE_KEYWORD_TO_SKILL = [
  { skill: 'climbing', pattern: /climb|hill|elevation|ascent|gradient|alpine|mountain/i },
  { skill: 'sprint', pattern: /sprint|time trial|acceleration|\bspeed\b/i },
  { skill: 'power', pattern: /power|watt|ftp|threshold/i },
  { skill: 'endurance', pattern: /endurance|long ride|\bdistance\b|volume|aerobic/i },
  { skill: 'consistency', pattern: /consisten|habit|ride count|frequency/i },
];

const LEGACY_GOAL_TYPE_TO_SKILL = {
  elevation: 'climbing',
  speed_hills: 'climbing',
  avg_hr_hills: 'climbing',
  distance: 'endurance',
  long_rides: 'endurance',
  time: 'endurance',
  rides_count: 'endurance',
  avg_power: 'power',
  ftp_vo2max: 'power',
  recovery: 'consistency',
  intervals: 'consistency',
  cadence: 'other',
  pulse: 'other',
  speed_flat: 'other',
};

export function getGoalSkill(goal) {
  const skill = goal.metric?.skill;
  if (skill && SKILL_GROUPS.some((g) => g.key === skill)) return skill;

  const field = goal.metric?.field;
  if (field && METRIC_FIELD_TO_SKILL[field]) return METRIC_FIELD_TO_SKILL[field];

  if (!field && goal.metric?.source === 'activity' && goal.metric?.filter?.min_distance) {
    return 'endurance';
  }

  const text = `${goal.title || ''} ${goal.description || ''}`;
  const keywordMatch = TITLE_KEYWORD_TO_SKILL.find((k) => k.pattern.test(text));
  if (keywordMatch) return keywordMatch.skill;

  if (goal.goal_type && LEGACY_GOAL_TYPE_TO_SKILL[goal.goal_type]) {
    return LEGACY_GOAL_TYPE_TO_SKILL[goal.goal_type];
  }

  return 'other';
}

// Groups sub-goals by `getGoalSkill`, in `SKILL_GROUPS` order, dropping
// empty groups — the shape SubGoalsTable's board columns iterate over.
export function groupSubGoalsBySkill(subGoals) {
  return SKILL_GROUPS.map((group) => ({
    ...group,
    goals: subGoals.filter((g) => getGoalSkill(g) === group.key),
  })).filter((group) => group.goals.length > 0);
}

// Ahead/behind/on-track badge from the server-computed `pace` object (only
// present for goals with fixed start_date/end_date — see server's
// goalCalculator.js `addPaceData`).
export function getPaceBadge(goal) {
  if (!goal.pace) return null;
  if (goal.pace.onTrack) {
    return { label: 'On track', color: '#10b981' };
  }
  return goal.pace.percentDelta < 0
    ? { label: 'Behind schedule', color: '#ef4444' }
    : { label: 'Ahead of schedule', color: '#10b981' };
}

// --- ProgressSection / GoalHeader — reading server-computed progress -
//
// T-6.3 (audit W-08/W-09 follow-up): the pre-split page recomputed overall
// progress itself from `current_value`/`target_value` per sub-goal
// (`Math.min((current / target) * 100, 100)`, averaged) even though every
// sub-goal row already carries a server-computed `percent` field (rounded,
// capped at 100 — see server/services/goals.js `withGoalProgress`) that is
// the SAME number GoalCard/MetaGoalRow/GoalDetailPage all should show. That
// duplicate formula is deleted; this just averages the field the server
// already sent. GoalAssistantPage.jsx's unused `calculateMetaProgress`
// (dead code — no call site) is deleted outright rather than moved, for the
// same reason.
export function averagePercent(goals) {
  if (!goals || goals.length === 0) return 0;
  const total = goals.reduce((sum, g) => sum + (Number(g.percent) || 0), 0);
  return total / goals.length;
}

// Non-ftp_vo2max sub-goals — legacy special case with its own target_value
// semantics, excluded from the overall-progress average everywhere (moved
// verbatim from GoalDetailPage's `relevantSubGoals`).
export function filterRelevantSubGoals(subGoals) {
  return (subGoals || []).filter((g) => g.goal_type !== 'ftp_vo2max');
}

export function getProgressStatusLabel(overallProgress, relevantSubGoals) {
  if (relevantSubGoals.some((g) => getPaceBadge(g)?.label === 'Behind schedule')) {
    return 'Behind Schedule';
  }
  if (overallProgress >= 100) return 'Goal Achieved';
  if (overallProgress >= 75) return 'Almost There';
  if (overallProgress >= 50) return 'Making Progress';
  if (overallProgress >= 25) return 'Building Momentum';
  return 'Just Getting Started';
}

// `metaGoal.target_date` is basically never populated by the redesigned AI
// prompt anymore — deadlines live per sub-goal as `end_date`. Falls back to
// the latest sub-goal `end_date`; legacy goals with `target_date` still win.
export function formatDate(dateString) {
  if (!dateString) return 'No deadline';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same local-time-parse trick the app's CalendarScreen/GoalDetailsScreen
// use: a bare "YYYY-MM-DD" parses as UTC midnight, which would render a day
// early for anyone west of UTC. Appending T00:00:00 (no "Z") forces local
// parsing.
export function formatScheduleDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
