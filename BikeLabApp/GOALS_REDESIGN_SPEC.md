# Goals System Redesign

> Spec for Sonnet. Transforms hardcoded goals into a dynamic, agent-driven system.

---

## 0. Core Problem

The current goals system has a fixed vocabulary: 11 `goal_type` values hardcoded in a `switch/case`, 3 hardcoded periods (`4w/3m/year`), and a static training library. Any goal outside this vocabulary — recovery focus, skill improvement, consistency habit, custom challenge — literally can't be created or tracked.

The redesign does three things:

1. **Dynamic goal types** — goals describe HOW to measure themselves instead of referencing a hardcoded enum
2. **Flexible periods** — `start_date` + `end_date` replace the `4w/3m/year` enum
3. **Coach as training engine** — remove static training library from goals, coach prescribes via calendar

---

## 1. New Sub-Goal Model

### 1.1 Current (rigid)

```typescript
interface Goal {
  goal_type: 'distance' | 'elevation' | ... ; // 11 fixed values
  target_value: number;
  current_value: number;
  period: '4w' | '3m' | 'year';              // 3 fixed values
}
```

Progress is computed by a `switch(goal.goal_type)` with 11 bespoke cases in BOTH `goalsCache.ts` (client) and `server.js` (server). Adding a goal type = adding code to 4 files.

### 1.2 New (declarative)

```typescript
interface Goal {
  // Identity
  id: number;
  meta_goal_id: number;
  title: string;
  description: string;

  // Measurement — defines HOW to calculate progress
  source: 'activity' | 'skills' | 'health' | 'coach';
  metric: GoalMetric;

  // Target
  target_value: number;
  current_value: number;
  unit: string;

  // Time window
  start_date: string;  // ISO date
  end_date: string;    // ISO date

  // Metadata
  priority: number;    // 1-5
  reasoning: string;

  // Legacy compat
  goal_type?: string;  // kept for legacy goals, ignored for new ones
  period?: string;     // kept for legacy goals, ignored for new ones
}

interface GoalMetric {
  // What data source to query
  source: 'activity' | 'skills' | 'health' | 'coach';

  // For activity-based goals:
  aggregate?: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'count_where' | 'median';
  field?: string;       // activity field: distance, total_elevation_gain, moving_time,
                        // average_speed, average_heartrate, average_cadence, average_watts, max_speed
  transform?: number;   // multiplier: 0.001 for m→km, 0.000277778 for s→hours, 3.6 for m/s→km/h
  filter?: ActivityFilter;

  // For skills-based goals:
  skill?: 'climbing' | 'sprint' | 'endurance' | 'tempo' | 'power' | 'consistency';

  // For health-based goals:
  health_metric?: 'hrv' | 'resting_hr' | 'sleep_hours' | 'weight';

  // For coach-tracked goals:
  // No extra fields needed — coach updates current_value via update_goal tool
}

interface ActivityFilter {
  type_in?: string[];           // ['Ride', 'VirtualRide']
  min_distance?: number;        // meters
  max_distance?: number;
  min_elevation_rate?: number;  // elevation / distance ratio (e.g. 0.015 for "hilly")
  max_elevation_rate?: number;  // e.g. 0.02 for "flat"
  max_elevation?: number;       // absolute max, e.g. 500m for "flat rides"
  min_speed?: number;           // m/s
  max_speed?: number;
  min_moving_time?: number;     // seconds
  name_contains?: string[];     // keyword match in activity name
}
```

### 1.3 What this enables

| User says | source | aggregate | field | filter | target |
|---|---|---|---|---|---|
| "Ride 400km this month" | activity | sum | distance (×0.001) | — | 400 km |
| "Improve climbing speed to 16 km/h" | activity | avg | average_speed (×3.6) | min_elevation_rate: 0.015 | 16 km/h |
| "Do 4 rides per week" | activity | count | — | — | 4×weeks rides |
| "One ride over 100km" | activity | max | distance (×0.001) | — | 100 km |
| "3 interval workouts" | activity | count_where | — | name_contains: ["interval","tempo",...] | 3 workouts |
| "Improve sprint skill to 60" | skills | — | — | skill: sprint | 60 points |
| "Get climbing score to 70" | skills | — | — | skill: climbing | 70 points |
| "Improve recovery (HRV above 50ms)" | health | — | — | health_metric: hrv | 50 ms |
| "Lower resting HR to 55" | health | — | — | health_metric: resting_hr | 55 bpm |
| "Work on descending technique" | coach | — | — | — | 100 % |

### 1.4 Migration SQL

```sql
-- Add new columns to goals table
ALTER TABLE goals ADD COLUMN source TEXT DEFAULT 'activity';
ALTER TABLE goals ADD COLUMN metric JSONB;
ALTER TABLE goals ADD COLUMN start_date DATE;
ALTER TABLE goals ADD COLUMN end_date DATE;

-- Migrate existing goals: backfill metric from goal_type
-- (one-time migration script, examples below)
UPDATE goals SET
  source = 'activity',
  metric = jsonb_build_object(
    'source', 'activity',
    'aggregate', 'sum',
    'field', 'distance',
    'transform', 0.001
  ),
  start_date = COALESCE(created_at::date, NOW()::date - INTERVAL '28 days'),
  end_date = CASE
    WHEN period = '4w' THEN COALESCE(created_at::date, NOW()::date) + INTERVAL '28 days'
    WHEN period = '3m' THEN COALESCE(created_at::date, NOW()::date) + INTERVAL '92 days'
    WHEN period = 'year' THEN COALESCE(created_at::date, NOW()::date) + INTERVAL '365 days'
    ELSE COALESCE(created_at::date, NOW()::date) + INTERVAL '28 days'
  END
WHERE goal_type = 'distance';

-- (repeat for each goal_type — full migration script in section 5)
```

---

## 2. Universal Progress Calculator

Replace the 11-case `switch` with a single universal calculator. Lives on the **server only** — remove `calculateGoalProgress` from `goalsCache.ts` entirely. Client always fetches calculated progress from the API.

### 2.1 Server-side calculator

New file: `server/goalCalculator.js`

```javascript
/**
 * Universal goal progress calculator.
 * Evaluates any declarative GoalMetric against activity/skills/health data.
 */

function calculateProgress(goal, activities, skillsSnapshot, healthData) {
  const metric = goal.metric;
  if (!metric) {
    // Legacy goal — fall back to old switch/case
    return calculateLegacyProgress(goal, activities);
  }

  switch (metric.source) {
    case 'activity':
      return calculateActivityProgress(goal, activities);
    case 'skills':
      return calculateSkillsProgress(goal, skillsSnapshot);
    case 'health':
      return calculateHealthProgress(goal, healthData);
    case 'coach':
      // Coach-tracked — return stored current_value as-is
      return goal.current_value || 0;
    default:
      return 0;
  }
}

function calculateActivityProgress(goal, activities) {
  const metric = goal.metric;

  // 1. Filter by date range
  let filtered = activities.filter(a => {
    const date = new Date(a.start_date);
    return date >= new Date(goal.start_date) && date <= new Date(goal.end_date);
  });

  // 2. Apply activity filter
  if (metric.filter) {
    filtered = applyActivityFilter(filtered, metric.filter);
  }

  // 3. Aggregate
  const field = metric.field;
  const transform = metric.transform || 1;

  switch (metric.aggregate) {
    case 'sum':
      return filtered.reduce((s, a) => s + (a[field] || 0), 0) * transform;

    case 'avg':
      if (filtered.length === 0) return 0;
      const sum = filtered.reduce((s, a) => s + (a[field] || 0), 0);
      return (sum / filtered.length) * transform;

    case 'max':
      if (filtered.length === 0) return 0;
      return Math.max(...filtered.map(a => (a[field] || 0))) * transform;

    case 'min':
      if (filtered.length === 0) return 0;
      return Math.min(...filtered.map(a => (a[field] || 0))) * transform;

    case 'count':
      return filtered.length;

    case 'count_where':
      // count with additional name-based filtering (for intervals, etc.)
      return filtered.length;

    case 'median':
      if (filtered.length === 0) return 0;
      const values = filtered.map(a => (a[field] || 0) * transform).sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

    default:
      return 0;
  }
}

function applyActivityFilter(activities, filter) {
  return activities.filter(a => {
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
    if (filter.name_contains && !filter.name_contains.some(kw => name.includes(kw.toLowerCase()))) return false;

    return true;
  });
}

function calculateSkillsProgress(goal, skillsSnapshot) {
  if (!skillsSnapshot || !goal.metric.skill) return goal.current_value || 0;
  return skillsSnapshot[goal.metric.skill] || 0;
}

function calculateHealthProgress(goal, healthData) {
  if (!healthData || !goal.metric.health_metric) return goal.current_value || 0;
  return healthData[goal.metric.health_metric] || 0;
}

// Legacy fallback for goals without metric JSONB
function calculateLegacyProgress(goal, activities) {
  // ... existing switch/case from current server.js, unchanged
}
```

### 2.2 Remove client-side calculation

Delete `calculateGoalProgress` from `goalsCache.ts`. The client calls `GET /api/meta-goals/:id` which returns pre-calculated `current_value` for every sub-goal.

Change `MetaGoalCard.tsx`: instead of computing progress locally, use `current_value` / `target_value` from the API response directly. The server already populates these in the `GET /api/meta-goals` endpoint.

### 2.3 Pace tracking

The server adds pace data to every sub-goal in `GET /api/meta-goals/:id`:

```javascript
function addPaceData(goal) {
  const start = new Date(goal.start_date);
  const end = new Date(goal.end_date);
  const now = new Date();

  const totalDays = Math.max(1, (end - start) / 86400000);
  const daysElapsed = Math.max(1, (now - start) / 86400000);
  const daysRemaining = Math.max(0, (end - now) / 86400000);

  const expectedProgress = (daysElapsed / totalDays) * goal.target_value;
  const actualProgress = goal.current_value || 0;

  return {
    ...goal,
    pace: {
      daysElapsed: Math.round(daysElapsed),
      daysRemaining: Math.round(daysRemaining),
      expectedValue: Math.round(expectedProgress * 100) / 100,
      onTrack: actualProgress >= expectedProgress * 0.85, // 15% tolerance
      percentDelta: expectedProgress > 0
        ? Math.round(((actualProgress - expectedProgress) / expectedProgress) * 100)
        : 0,
    }
  };
}
```

---

## 3. AI Goal Generation — New Prompt

Replace the 517-line prompt in `aiGoals.js` with a shorter, declarative prompt that outputs `GoalMetric` objects.

### 3.1 Prompt structure (key delta from current)

Remove from prompt:
- Fixed "Available goal_types" list of 11 items
- Fixed "Periods: 4w, 3m, year"
- All the TITLE-MUST-MATCH-GOAL_TYPE validation (no longer needed — title is free-form)
- Training types section (moved to coach)

Add to prompt:

```
═══════════════════════════════════════════════════════════════════
🎯 GOAL MEASUREMENT SYSTEM
═══════════════════════════════════════════════════════════════════
Each sub-goal must define HOW to measure progress via a "metric" object.
You have four measurement sources:

SOURCE: "activity" — calculated from the rider's Strava activities
  aggregate: "sum" | "avg" | "max" | "count" | "median"
  field: one of: distance, total_elevation_gain, moving_time,
         average_speed, average_heartrate, average_cadence,
         average_watts, max_speed
  transform: numeric multiplier (0.001 = meters to km, 3.6 = m/s to km/h,
             0.000277778 = seconds to hours)
  filter: optional object to narrow which activities count:
    - min_distance / max_distance (meters)
    - min_elevation_rate / max_elevation_rate (elevation/distance ratio,
      e.g. 0.015 = hilly, <0.02 = flat)
    - max_elevation (meters, e.g. 500 for "flat rides")
    - min_speed / max_speed (km/h)
    - min_moving_time (seconds, e.g. 9000 = 2.5 hours)
    - name_contains: ["keyword1", "keyword2"] for activity name matching
    - type_in: ["Ride", "VirtualRide", "Workout"]

SOURCE: "skills" — current value from the rider's skills radar
  skill: "climbing" | "sprint" | "endurance" | "tempo" | "power" | "consistency"
  No aggregation needed — just the latest score (0-100).

SOURCE: "health" — from Apple Health (if available)
  health_metric: "hrv" | "resting_hr" | "sleep_hours" | "weight"
  No aggregation needed — latest value.

SOURCE: "coach" — you (the coach) track this qualitatively
  No metric fields needed. You will update current_value (0-100)
  through update_goal based on conversation and your assessment.
  Use for technique, confidence, nutrition habits, or anything
  not auto-computable.

DATES: each sub-goal has start_date and end_date (YYYY-MM-DD).
Derive from the meta-goal's target_date. If the meta-goal says
"in 3 months", set end_date = today + 90 days, start_date = today.
Short goals (1-2 weeks) are valid and encouraged for focused sprints.

═══════════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════════

Goal: "I want to ride 400km per month"
{
  "title": "Monthly Distance Volume",
  "metric": {
    "source": "activity",
    "aggregate": "sum",
    "field": "distance",
    "transform": 0.001
  },
  "target_value": 400,
  "unit": "km",
  "start_date": "2026-07-09",
  "end_date": "2026-08-09",
  "priority": 1,
  "reasoning": "Build aerobic base with consistent weekly mileage"
}

Goal: "Improve my flat speed to 30 km/h"
{
  "title": "Flat Terrain Average Speed",
  "metric": {
    "source": "activity",
    "aggregate": "avg",
    "field": "average_speed",
    "transform": 3.6,
    "filter": {
      "min_distance": 3000,
      "max_elevation_rate": 0.02,
      "max_elevation": 500
    }
  },
  "target_value": 30,
  "unit": "km/h",
  "start_date": "2026-07-09",
  "end_date": "2026-10-09",
  "priority": 1,
  "reasoning": "Focus on aerodynamic efficiency and sustained power on flats"
}

Goal: "Ride 4 times per week for a month"
{
  "title": "Weekly Ride Consistency",
  "metric": {
    "source": "activity",
    "aggregate": "count"
  },
  "target_value": 16,
  "unit": "rides",
  "start_date": "2026-07-09",
  "end_date": "2026-08-06",
  "priority": 1,
  "reasoning": "Build consistent training habit — 4 rides × 4 weeks"
}

Goal: "Do one century ride (100+ km)"
{
  "title": "Century Ride Challenge",
  "metric": {
    "source": "activity",
    "aggregate": "max",
    "field": "distance",
    "transform": 0.001
  },
  "target_value": 100,
  "unit": "km",
  "start_date": "2026-07-09",
  "end_date": "2026-09-09",
  "priority": 1,
  "reasoning": "Push endurance boundary with first 100km single-ride effort"
}

Goal: "Get my climbing skill to 65"
{
  "title": "Climbing Skill Development",
  "metric": {
    "source": "skills",
    "skill": "climbing"
  },
  "target_value": 65,
  "unit": "score",
  "start_date": "2026-07-09",
  "end_date": "2026-10-09",
  "priority": 1,
  "reasoning": "Systematic climbing improvement through targeted hill work"
}

Goal: "Improve my sprint/attack ability"
{
  "title": "Sprint & Attack Skill",
  "metric": {
    "source": "skills",
    "skill": "sprint"
  },
  "target_value": 55,
  "unit": "score",
  "start_date": "2026-07-09",
  "end_date": "2026-09-09",
  "priority": 1,
  "reasoning": "Develop explosive power and attack capability"
}

Goal: "Improve recovery — lower resting HR to 55"
{
  "title": "Resting Heart Rate",
  "metric": {
    "source": "health",
    "health_metric": "resting_hr"
  },
  "target_value": 55,
  "unit": "bpm",
  "start_date": "2026-07-09",
  "end_date": "2026-10-09",
  "priority": 2,
  "reasoning": "Lower resting HR indicates improved cardiac efficiency and recovery"
}

Goal: "Work on my descending confidence"
{
  "title": "Descending Technique",
  "metric": {
    "source": "coach"
  },
  "target_value": 100,
  "unit": "%",
  "start_date": "2026-07-09",
  "end_date": "2026-09-09",
  "priority": 3,
  "reasoning": "Qualitative skill — coach assesses through ride reports and conversation"
}
```

### 3.2 Output structure — simplified

Remove `trainingTypes` from AI output. The coach prescribes training through calendar events, not through a static training library baked into the goal.

```json
{
  "metaGoal": {
    "title": "string (max 60 chars)",
    "description": "string (max 120 chars, one sentence)",
    "tier": "legendary | epic | grand | base",
    "focusTags": ["1-3 tags from FOCUS_TAGS"]
  },
  "subGoals": [
    {
      "title": "string",
      "description": "string",
      "metric": { GoalMetric object },
      "target_value": number,
      "unit": "string",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "priority": 1-5,
      "reasoning": "string"
    }
  ],
  "timeline": "string — overall plan overview",
  "mainFocus": "string — primary training systems"
}
```

### 3.3 Validation — server-side

After parsing AI response, validate each sub-goal:

```javascript
function validateMetric(metric) {
  const validSources = ['activity', 'skills', 'health', 'coach'];
  if (!validSources.includes(metric.source)) return false;

  if (metric.source === 'activity') {
    const validAggregates = ['sum', 'avg', 'max', 'min', 'count', 'count_where', 'median'];
    if (!validAggregates.includes(metric.aggregate)) return false;
    if (metric.aggregate !== 'count' && metric.aggregate !== 'count_where' && !metric.field) return false;
    const validFields = [
      'distance', 'total_elevation_gain', 'moving_time',
      'average_speed', 'average_heartrate', 'average_cadence',
      'average_watts', 'max_speed'
    ];
    if (metric.field && !validFields.includes(metric.field)) return false;
  }

  if (metric.source === 'skills') {
    const validSkills = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];
    if (!validSkills.includes(metric.skill)) return false;
  }

  if (metric.source === 'health') {
    const validHealth = ['hrv', 'resting_hr', 'sleep_hours', 'weight'];
    if (!validHealth.includes(metric.health_metric)) return false;
  }

  return true;
}
```

### 3.4 Existing goals context

Pass active goals to the prompt so AI doesn't duplicate:

```javascript
const existingGoals = await pool.query(
  `SELECT mg.title, mg.focus_tags, mg.target_date,
          g.title as sub_title, g.metric, g.target_value, g.unit,
          g.start_date, g.end_date
   FROM meta_goals mg
   LEFT JOIN goals g ON g.meta_goal_id = mg.id
   WHERE mg.user_id = $1 AND mg.status = 'active'`,
  [userId]
);
```

Add to prompt:
```
EXISTING ACTIVE GOALS (do NOT duplicate):
${JSON.stringify(grouped, null, 2)}
```

---

## 4. Training Library — Deprecation

### 4.1 Problem

The current flow stores 4 `trainingTypes` in `ai_context` at goal creation time. These are static recommendations that never update. `GoalDetailsScreen` renders them on a "Trainings" tab with data from `/api/training-types`. The training library has ~14 types with hardcoded intensity/duration/structure.

With the AI coach now able to:
- Prescribe specific workouts through calendar events (`create_calendar_event`)
- Adapt recommendations based on current progress and conversation
- Link calendar events to goals via `goal_id`

...the static training library is redundant.

### 4.2 Plan

**Phase 1** (this spec): Stop generating `trainingTypes` in new goals. Remove the training-types section from the AI prompt. Keep the "Trainings" tab in GoalDetailsScreen but repurpose it:

- If goal has `trainingTypes` in `ai_context` (legacy): show them as before
- If goal has no `trainingTypes` (new): show "Ask Coach for a training plan →" CTA button that opens CoachChatScreen with `initialPrompt: "Suggest training sessions for my goal: {goal.title}"`

**Phase 2** (future): Remove the Trainings tab entirely. Calendar events linked to the goal (already visible on the Schedule tab) become the sole training plan.

### 4.3 Server cleanup

- Remove `trainingTypes` from `generateGoalsWithAI` output schema
- Keep `/api/training-types` endpoint alive for legacy goals
- Keep `getTrainingTypeDetails` / `getAllTrainingTypes` for now
- Remove training-types section from the AI prompt (~70 lines saved)

---

## 5. Full Migration Script

```sql
-- 1. Alter goals table
ALTER TABLE goals ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'activity';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS metric JSONB;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS end_date DATE;

-- 2. Backfill metric JSONB from goal_type for existing goals
-- distance
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"sum","field":"distance","transform":0.001}'::jsonb
WHERE goal_type = 'distance' AND metric IS NULL;

-- elevation
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"sum","field":"total_elevation_gain"}'::jsonb
WHERE goal_type = 'elevation' AND metric IS NULL;

-- time
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"sum","field":"moving_time","transform":0.000277778}'::jsonb
WHERE goal_type = 'time' AND metric IS NULL;

-- speed_flat
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"avg","field":"average_speed","transform":3.6,"filter":{"min_distance":3000,"max_elevation_rate":0.02,"max_elevation":500}}'::jsonb
WHERE goal_type = 'speed_flat' AND metric IS NULL;

-- speed_hills
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"avg","field":"average_speed","transform":3.6,"filter":{"min_distance":3000,"min_elevation_rate":0.015}}'::jsonb
WHERE goal_type = 'speed_hills' AND metric IS NULL;

-- long_rides
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"count","filter":{"min_distance":50000}}'::jsonb
WHERE goal_type = 'long_rides' AND metric IS NULL;
-- Note: the old logic also counted by moving_time > 2.5h — simplified to distance-only

-- intervals
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"count_where","filter":{"name_contains":["interval","tempo","threshold","vo2max","sprint","fartlek","repeat"]}}'::jsonb
WHERE goal_type = 'intervals' AND metric IS NULL;

-- pulse (avg HR)
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"avg","field":"average_heartrate"}'::jsonb
WHERE goal_type = 'pulse' AND metric IS NULL;

-- cadence
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"avg","field":"average_cadence"}'::jsonb
WHERE goal_type = 'cadence' AND metric IS NULL;

-- avg_power
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"avg","field":"average_watts"}'::jsonb
WHERE goal_type = 'avg_power' AND metric IS NULL;

-- recovery
UPDATE goals SET
  metric = '{"source":"activity","aggregate":"count","filter":{"max_speed":20,"type_in":["Ride","VirtualRide"]}}'::jsonb
WHERE goal_type = 'recovery' AND metric IS NULL;

-- 3. Backfill dates from period
UPDATE goals SET
  start_date = COALESCE(created_at::date, '2026-01-01'),
  end_date = CASE
    WHEN period = '4w' THEN COALESCE(created_at::date, '2026-01-01') + INTERVAL '28 days'
    WHEN period = '3m' THEN COALESCE(created_at::date, '2026-01-01') + INTERVAL '92 days'
    WHEN period = 'year' THEN COALESCE(created_at::date, '2026-01-01') + INTERVAL '365 days'
    ELSE COALESCE(created_at::date, '2026-01-01') + INTERVAL '28 days'
  END
WHERE start_date IS NULL;

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_goals_dates ON goals (start_date, end_date);
```

---

## 6. Coach Integration

### 6.1 System prompt additions

Add to `buildSystemPrompt()` in `aiCoach.js`:

```
## Goals — Updated Capabilities

Sub-goals now use a declarative metric system. When creating goals with create_goal,
the system generates sub-goals that can measure:

- Activity metrics: any sum/avg/max/count over Strava fields (distance, elevation,
  speed, HR, power, cadence, moving time) with optional filters (flat rides, hilly rides,
  long rides, workouts by name)
- Skills radar scores: climbing, sprint, endurance, tempo, power, consistency (0-100)
- Health metrics: HRV, resting HR, sleep, weight (from Apple Health when available)
- Coach-tracked: qualitative goals where YOU update progress (0-100%) based on
  conversation and assessment (e.g., technique, confidence, nutrition habits)

For coach-tracked goals: when the user reports progress ("I practiced cornering today",
"my nutrition has been on point this week"), evaluate and call update_goal to set a new
current_value reflecting your assessment. Be generous but honest.

Each sub-goal has start_date and end_date — no fixed period enum. You can create
goals for any duration: 1 week, 2 weeks, a month, a season, a year. Match the
duration to what makes sense for the goal.

When discussing goals, note the pace: is the rider ahead or behind schedule?
If behind by >20%, suggest adjustments. If a goal's end_date has passed and it's
still active, mention it and suggest extending, adjusting, or completing.
```

### 6.2 update_goal tool — extend

Current `update_goal` only handles `status` and `target_date`. Extend:

```javascript
{
  type: 'function',
  function: {
    name: 'update_goal',
    description:
      'Update a goal\'s status, dates, or progress. Use to: ' +
      '(1) mark a goal complete or extend its deadline, ' +
      '(2) update current_value for coach-tracked goals based on your assessment, ' +
      '(3) adjust target_value if the rider is significantly over/under-performing.',
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: 'integer', description: 'The meta_goal ID.' },
        status: { type: 'string', enum: ['active', 'completed'] },
        target_date: { type: 'string', description: 'New target date (YYYY-MM-DD).' },
        // NEW:
        sub_goal_id: { type: 'integer', description: 'Specific sub-goal to update (for coach-tracked progress).' },
        current_value: { type: 'number', description: 'New current_value for a coach-tracked sub-goal (0-100).' },
        new_target_value: { type: 'number', description: 'Adjust target for a sub-goal (when over/under-performing).' },
        new_end_date: { type: 'string', description: 'Extend a sub-goal\'s end date.' },
      },
      required: ['goal_id'],
    },
  },
}
```

### 6.3 get_goals_progress tool — enrich response

Current response: `{ goals: [...] }`. Enrich with pace data and lifecycle flags:

```javascript
async get_goals_progress(args, { userId }) {
  const metaGoals = await pool.query(
    'SELECT * FROM meta_goals WHERE user_id = $1',
    [userId]
  );

  const result = [];
  for (const mg of metaGoals.rows) {
    const subGoals = await pool.query(
      'SELECT * FROM goals WHERE meta_goal_id = $1',
      [mg.id]
    );

    // Calculate progress for each sub-goal
    const enrichedSubGoals = subGoals.rows.map(sg => {
      const progress = calculateProgress(sg, activities, skillsSnapshot, healthData);
      const withPace = addPaceData({ ...sg, current_value: progress });
      return withPace;
    });

    // Overall progress
    const overallProgress = enrichedSubGoals.length > 0
      ? enrichedSubGoals.reduce((s, g) => {
          return s + Math.min((g.current_value / g.target_value) * 100, 100);
        }, 0) / enrichedSubGoals.length
      : 0;

    // Lifecycle flags
    const allComplete = enrichedSubGoals.every(g => g.current_value >= g.target_value);
    const expired = mg.target_date && new Date(mg.target_date) < new Date() && mg.status === 'active';
    const overachieving = enrichedSubGoals.some(g => g.current_value > g.target_value * 1.3);

    result.push({
      id: mg.id,
      title: mg.title,
      status: mg.status,
      tier: mg.tier,
      target_date: mg.target_date,
      overallProgress: Math.round(overallProgress),
      readyToComplete: allComplete && mg.status === 'active',
      expired,
      overachieving,
      subGoals: enrichedSubGoals,
    });
  }

  return { goals: result };
}
```

---

## 7. Frontend Changes

### 7.1 GoalDetailsScreen — Metrics tab

Replace per-type label/unit maps with dynamic rendering from the goal itself:

```typescript
// OLD — hardcoded maps
const getGoalTypeLabel = (goalType: string): string => {
  const labels = { distance: '...', elevation: '...', ... };
  return labels[goalType] || goalType;
};

// NEW — use goal's own title and unit
<Text>{goal.title}</Text>
<Text>{goal.current_value} / {goal.target_value} {goal.unit}</Text>
```

Add pace indicator:

```typescript
const PaceBadge: React.FC<{pace: GoalPace}> = ({pace}) => {
  if (pace.daysRemaining <= 0) return <Text style={s.expired}>Expired</Text>;
  const color = pace.onTrack ? '#10B981' : pace.percentDelta > -20 ? '#F59E0B' : '#EF4444';
  const label = pace.percentDelta >= 0
    ? `${pace.percentDelta}% ahead`
    : `${Math.abs(pace.percentDelta)}% behind`;
  return <Text style={[s.paceBadge, {color}]}>{label}</Text>;
};
```

### 7.2 GoalDetailsScreen — Trainings tab

For new goals (no `trainingTypes` in `ai_context`):

```tsx
<View style={styles.askCoachContainer}>
  <Text style={styles.askCoachText}>
    {t('goalDetails.coachCanPrescribe')}
  </Text>
  <TouchableOpacity
    style={styles.askCoachButton}
    onPress={() => navigation.navigate('GoalsTab', {
      screen: 'CoachChat',
      params: { initialPrompt: `Create a training plan for my goal: ${metaGoal.title}` }
    })}>
    <Text style={styles.askCoachButtonText}>
      {t('goalDetails.askCoachForPlan')}
    </Text>
  </TouchableOpacity>
</View>
```

### 7.3 MetaGoalCard

Add pace dot:

```tsx
// Inside content, after description:
{!loading && (
  <View style={styles.paceRow}>
    <View style={[styles.paceDot, { backgroundColor: paceColor }]} />
    <Text style={styles.paceLabel}>{paceLabel}</Text>
  </View>
)}
```

### 7.4 goalsCache.ts

Remove `calculateGoalProgress` and all related switch/case logic. Keep only the cache utilities for API responses. The `Goal` and `MetaGoal` interfaces update to match the new model.

```typescript
export interface Goal {
  id: number;
  meta_goal_id?: number;
  title: string;
  description?: string;
  source: 'activity' | 'skills' | 'health' | 'coach';
  metric: GoalMetric;
  target_value: number;
  current_value: number;
  unit: string;
  start_date: string;
  end_date: string;
  priority: number;
  reasoning?: string;
  pace?: GoalPace;
  // Legacy compat
  goal_type?: string;
  period?: string;
}

export interface GoalPace {
  daysElapsed: number;
  daysRemaining: number;
  expectedValue: number;
  onTrack: boolean;
  percentDelta: number;
}
```

---

## 8. Implementation Phases

### Phase 1 — Backend: declarative calculator + migration (~2 days)

Files to create:
- `server/goalCalculator.js` — universal progress calculator

Files to modify:
- `server/server.js` — run migration SQL, update `GET /api/meta-goals` and `GET /api/meta-goals/:id` to use new calculator + pace data
- `server/aiCoach.js` — enrich `get_goals_progress` response with pace + lifecycle flags, extend `update_goal` tool

### Phase 2 — AI prompt rewrite (~1 day)

Files to modify:
- `server/aiGoals.js` — rewrite prompt to output `GoalMetric` objects instead of `goal_type` enum. Remove training-types section. Add existing-goals context. Add metric validation.

### Phase 3 — Frontend adaptation (~2 days)

Files to modify:
- `BikeLabApp/src/utils/goalsCache.ts` — remove `calculateGoalProgress`, update interfaces
- `BikeLabApp/src/components/MetaGoalCard.tsx` — remove local progress calculation, add pace indicator, use API-provided values
- `BikeLabApp/src/screens/GoalDetailsScreen.tsx` — dynamic labels/units from goal data, pace badges, Trainings tab fallback to coach CTA
- `BikeLabApp/src/components/coach/GoalsPanel.tsx` — minor: pass through new data shape

### Phase 4 — Verify + clean up (~1 day)

- Verify legacy goals still work (fallback path)
- Verify new goals with skills/health/coach sources
- Remove `calculateGoalProgress` from client completely (already done in Phase 3, verify no residual calls)
- Add i18n keys for pace labels, "Ask Coach" button

---

## 9. Files Summary

### New Files

| File | Purpose |
|---|---|
| `server/goalCalculator.js` | Universal declarative progress calculator |

### Modified Files

| File | Changes |
|---|---|
| `server/aiGoals.js` | Rewrite prompt: declarative metrics, no training types, flexible dates, existing goals context |
| `server/aiCoach.js` | Enrich `get_goals_progress` with pace/lifecycle, extend `update_goal` with sub-goal operations |
| `server/server.js` | Migration SQL, update goal API endpoints to use goalCalculator |
| `BikeLabApp/src/utils/goalsCache.ts` | Remove `calculateGoalProgress`, update `Goal`/`MetaGoal` interfaces |
| `BikeLabApp/src/components/MetaGoalCard.tsx` | Remove local calculation, add pace dot, use API values |
| `BikeLabApp/src/screens/GoalDetailsScreen.tsx` | Dynamic labels, pace badges, coach CTA on Trainings tab |

### Deleted Code (not files)

| Location | What |
|---|---|
| `goalsCache.ts` | `calculateGoalProgress` function (~100 lines) |
| `server.js` | Server-side `calculateGoalProgress` switch/case (~200 lines, replaced by goalCalculator.js) |
| `aiGoals.js` | Training types prompt section (~70 lines), fixed goal_type list, fixed period list |
