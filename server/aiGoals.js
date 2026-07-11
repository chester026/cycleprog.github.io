const OpenAI = require('openai');
const { validateMetric } = require('./goalCalculator');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Controlled vocabulary for metaGoal.focusTags — the goal's overall THEME
// (why the rider wants it), deliberately separate from subGoals[].goal_type
// (the low-level metric each sub-goal tracks: distance/elevation/speed/etc).
// Almost every goal shares a few goal_types (a climbing goal and a gran-fondo
// goal both usually include "distance" and "elevation" sub-goals) — that
// overlap is normal and NOT a sign of duplication. focus_tags exist so
// aiCoach.js's create_goal can flag a *possible* duplicate off the theme
// instead ("you already have an active climbing goal") without blocking
// creation — the rider might legitimately want three separate climbing
// goals for three different peaks. Exported so aiCoach.js can validate/
// filter whatever the model returns against this exact list.
const FOCUS_TAGS = [
  'climbing', 'sprint', 'endurance', 'tempo', 'power', 'ftp', 'attack',
  'discipline', 'heart_rate', 'cadence', 'race_prep', 'weight_loss',
  'general_fitness', 'recovery',
];

/**
 * Генерирует мета-цель и подцели на основе описания пользователя
 * @param {string} userGoalDescription - Описание цели от пользователя
 * @param {object} userProfile - Профиль пользователя
 * @param {object} recentStats - Статистика за последние 3 месяца
 * @param {object} trends - Анализ трендов производительности (опционально)
 * @param {object} analysis - Анализ сильных/слабых сторон (опционально)
 * @param {Array<{title:string, focus_tags:string[], target_date:string|null, subGoals:Array<{title:string, metric:object, target_value:number, unit:string}>}>} existingGoals
 *   - the rider's currently active goals, so the model doesn't propose a
 *   near-identical sub-goal (same metric shape + overlapping dates) under a
 *   new meta-goal. Optional — pass [] or omit for the old behavior.
 * @returns {Promise<object>} - { metaGoal, subGoals, timeline, mainFocus }
 */
// Small date helpers — sub-goals now carry real start_date/end_date instead
// of a period enum (see STEP 5 below), so the prompt needs to anchor
// examples to the ACTUAL current date rather than a hardcoded literal that
// would silently go stale and risk the model copying a wrong year, the same
// class of bug aiCoach.js's buildSystemPrompt already guards against for
// calendar dates.
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

async function generateGoalsWithAI(userGoalDescription, userProfile = {}, recentStats = {}, trends = null, analysis = null, existingGoals = []) {
  const today = new Date();
  const todayISO = fmtDate(today);
  const in4w = addDays(today, 28);
  const in9w = addDays(today, 63);
  const in13w = addDays(today, 91);

  const existingGoalsBlock = existingGoals.length > 0 ? `
═══════════════════════════════════════════════════════════════════
📌 EXISTING ACTIVE GOALS (do not propose near-duplicate sub-goals)
═══════════════════════════════════════════════════════════════════
The rider already has these active goals:
${existingGoals.map((g) => `- "${g.title}" (tags: ${(g.focus_tags || []).join(', ') || 'none'}${g.target_date ? `, target ${g.target_date}` : ''})
${(g.subGoals || []).map((sg) => `    · ${sg.title}: ${sg.metric ? JSON.stringify(sg.metric) : '(legacy)'} → ${sg.target_value} ${sg.unit}`).join('\n')}`).join('\n')}

This is informational, NOT a hard block — a genuinely new goal can and should still get its own sub-goals even if they measure similar things (e.g. two separate climbing goals for two different mountains both tracking elevation is fine). Just avoid proposing a sub-goal that is essentially identical in metric AND overlapping in dates to one already listed above; pick a different aggregate/filter/date-range or skip it if there's nothing new to add.
` : '';

  const prompt = `
You are an expert cycling coach using a structured decision framework to create challenging, personalized training plans.

═══════════════════════════════════════════════════════════════════
🎯 USER'S GOAL: "${userGoalDescription}"
═══════════════════════════════════════════════════════════════════
${existingGoalsBlock}
STEP 1: VALIDATION
═══════════════════════════════════════════════════════════════════
Analyze if this request is DIRECTLY related to cycling, bike training, or endurance sports.

INVALID (respond with error):
- "How to cook pasta?" / "Write a program" / "Tell me about movies" / General life advice

VALID (proceed to analysis):
- "Ride 300km per week" / "Prepare for Gran Fondo" / "Improve my climbing" / "Ride in Dolomites"

If INVALID, respond with ONLY:
{
  "error": "INVALID_REQUEST",
  "message": "Sorry, I can only help with cycling and fitness goals. Please describe a cycling-related objective."
}

═══════════════════════════════════════════════════════════════════
📊 STEP 2: TERRAIN & LOCATION ANALYSIS FRAMEWORK
═══════════════════════════════════════════════════════════════════
Extract location/terrain keywords from goal and apply training focus:

MOUNTAIN/CLIMBING REGIONS (High Priority: Power, Climbing, VO2max):
Keywords: Dolomites, Alps, Pyrenees, mountains, climbing, cols, passes, steep, gradients
Focus Metrics:
  - elevation (PRIMARY - target 5000-8000m per 4w for serious mountain prep)
  - avg_power (target sustained power on climbs, 85-95% of FTP)
  - speed_hills (climbing speed improvement, 12-18 km/h on 6-8% grades)
  - intervals (VO2max and threshold work for explosive climbing)
  - long_rides (4-7 hour endurance for multi-col days)
Goal Philosophy: "Alpine events demand exceptional climbing capacity. Set aggressive elevation targets."
Target Guidelines:
  - Beginner mountain prep: 3500-5000m per 4w
  - Intermediate mountain prep: 5000-7000m per 4w
  - Advanced mountain prep: 6000-9000m per 4w
  - Elite alpine preparation: 8000-12000m per 4w

FLAT/SPEED REGIONS (High Priority: Speed, Endurance, Aerodynamics):
Keywords: Holland, Netherlands, Belgium, flat, plains, speed, TT, time trial, fast
Focus Metrics:
  - speed_flat (PRIMARY - target 3-5 km/h above current)
  - distance (volume for endurance)
  - avg_power (sustained threshold power)
  - cadence (high-cadence efficiency)
  - long_rides (stamina for sustained speed)
Goal Philosophy: "Maximize sustained speed and aerobic efficiency on flat terrain."

MIXED/GRAN FONDO TERRAIN (Balanced Approach):
Keywords: gran fondo, sportive, tour, ride, general fitness, varied
Focus Metrics:
  - distance (PRIMARY)
  - elevation (SECONDARY)
  - time (volume)
  - long_rides, intervals, recovery (balanced periodization)
Goal Philosophy: "Build comprehensive fitness for varied terrain."

═══════════════════════════════════════════════════════════════════
📈 STEP 3: CURRENT STATE ANALYSIS
═══════════════════════════════════════════════════════════════════
Experience Level: ${userProfile.experience_level || 'intermediate'}
Weekly Workouts: ${userProfile.workouts_per_week || 5}
Weight: ${userProfile.weight || 'unknown'} kg
FTP: ${userProfile.ftp || 'unknown'} W
Lactate Threshold HR: ${userProfile.lactate_threshold || 'unknown'} bpm

Recent Performance (3 months):
- Avg ride distance: ${recentStats.avgDistance || 'unknown'} km
- Avg speed: ${recentStats.avgSpeed || 'unknown'} km/h
- Total rides: ${recentStats.totalRides || 0}
- Avg HR: ${recentStats.avgHR || 'unknown'} bpm
- Total distance: ${recentStats.totalDistance || 'unknown'} km
- Total elevation: ${recentStats.totalElevation || 'unknown'} m

${trends ? `
📈 Performance Trends (Recent vs Previous Period):
- Distance trend: ${trends.distanceTrend.direction} (${trends.distanceTrend.change > 0 ? '+' : ''}${trends.distanceTrend.change}%)
  Was ${trends.distanceTrend.firstHalf}km avg, now ${trends.distanceTrend.secondHalf}km avg
- Elevation trend: ${trends.elevationTrend.direction} (${trends.elevationTrend.change > 0 ? '+' : ''}${trends.elevationTrend.change}%)
  Was ${trends.elevationTrend.firstHalf}m avg, now ${trends.elevationTrend.secondHalf}m avg
- Speed trend: ${trends.speedTrend.direction} (${trends.speedTrend.change > 0 ? '+' : ''}${trends.speedTrend.change}%)
  Was ${trends.speedTrend.firstHalf}km/h avg, now ${trends.speedTrend.secondHalf}km/h avg
- Training consistency: ${trends.consistency.rating} (${trends.consistency.ridesPerWeek} rides/week)
` : ''}
${analysis ? `
💪 Strengths & Weaknesses Analysis:
${analysis.strengths.length > 0 ? `STRENGTHS:
${analysis.strengths.map(s => `  + ${s}`).join('\n')}` : ''}
${analysis.weaknesses.length > 0 ? `
WEAKNESSES:
${analysis.weaknesses.map(w => `  - ${w}`).join('\n')}` : ''}
${analysis.recommendations.length > 0 ? `
RECOMMENDATIONS:
${analysis.recommendations.map(r => `  > ${r}`).join('\n')}` : ''}

Key Metrics:
- Average distance per ride: ${analysis.metrics.avgDistance}km
- Elevation per km: ${analysis.metrics.avgElevationPerKm}m/km
- Long rides (80+ km): ${analysis.metrics.longRidePercent}% of total
- Training frequency: ${analysis.metrics.ridesPerWeek} rides/week
` : ''}

═══════════════════════════════════════════════════════════════════
🚀 STEP 4: PROGRESSIVE OVERLOAD FRAMEWORK
═══════════════════════════════════════════════════════════════════
Set CHALLENGING but ACHIEVABLE goals using these multipliers:

Beginner (experience_level = beginner):
  • Distance: +15-20% above current 4-week average
  • Elevation: +20-25% above current
  • Speed: +1-2 km/h improvement
  • Volume: Weekly target = current + 15%

Intermediate (experience_level = intermediate):
  • Distance: +20-25% above current 4-week average
  • Elevation: +25-30% above current
  • Speed: +2-3 km/h improvement
  • Volume: Weekly target = current + 20%

Advanced (experience_level = advanced):
  • Distance: +25-30% above current 4-week average
  • Elevation: +30-40% above current
  • Speed: +3-5 km/h improvement
  • Volume: Weekly target = current + 25%

CRITICAL: Goals must be AMBITIOUS. Users want to be challenged, not coddled.
If user mentions specific event (e.g., "Gran Fondo"), assume they're serious and set aggressive targets.
USE TRENDS DATA: If trends show declining metrics, prioritize rebuilding that area.
USE WEAKNESSES DATA: Address identified weaknesses with specific sub-goals (e.g., if "limited climbing" means high elevation goal).
BUILD ON STRENGTHS: Leverage existing strengths to support goal achievement.

═══════════════════════════════════════════════════════════════════
🎯 STEP 5: GOAL MEASUREMENT SYSTEM
═══════════════════════════════════════════════════════════════════
Each sub-goal defines HOW to measure its own progress via a "metric" object — there is no fixed list of goal types to pick from, so you can build a sub-goal for anything trackable 0-100%, including a skill score or a qualitative habit, not just distance/elevation/speed. Four measurement sources:

SOURCE: "activity" — computed from the rider's Strava rides
  metric: {
    "source": "activity",
    "aggregate": "sum" | "avg" | "max" | "min" | "count" | "count_where" | "median",
    "field": one of distance, total_elevation_gain, moving_time, average_speed, average_heartrate, average_cadence, average_watts, max_speed (omit "field" when aggregate is "count" or "count_where"),
    "transform": numeric multiplier for unit conversion — 0.001 (meters→km), 3.6 (m/s→km/h), 0.000277778 (seconds→hours). Omit if the raw unit is already what you want.
    "filter": optional object narrowing which activities count:
      - min_distance / max_distance (meters)
      - min_elevation_rate / max_elevation_rate (elevation/distance ratio — 0.015+ counts as hilly, under 0.02 as flat)
      - max_elevation (meters, e.g. 500 for "flat rides")
      - min_speed / max_speed (km/h)
      - min_moving_time (seconds, e.g. 9000 = 2.5h for "long rides")
      - name_contains: ["interval","tempo","threshold",...] — keyword match on the activity name, for workout-type counts
      - type_in: ["Ride","VirtualRide"]
  }

SOURCE: "skills" — the rider's skills radar score (0-100, already tracked by the app)
  metric: { "source": "skills", "skill": "climbing" | "sprint" | "endurance" | "tempo" | "power" | "consistency" }
  Use when the rider's goal IS a skill, not a raw ride metric — "improve my sprint", "work on climbing ability", "build discipline/consistency".

SOURCE: "health" — from Apple Health, only meaningful if the rider has it connected (you don't know that at generation time — it's fine to create it regardless, the app just won't show live progress if they haven't connected)
  metric: { "source": "health", "health_metric": "hrv" | "resting_hr" | "sleep_hours" | "weight" }

SOURCE: "coach" — YOU track this qualitatively, there's no formula
  metric: { "source": "coach" }
  Use for technique, confidence, descending, cornering, nutrition habits — anything not auto-computable from ride data. target_value is typically 100 (percent); you move current_value later via update_goal based on how the conversation goes.

DATES: every sub-goal has start_date and end_date (YYYY-MM-DD), not a fixed period enum. Today's real date is ${todayISO} — always compute start_date/end_date from THIS, never guess or reuse a date from memory. Derive both from the meta-goal's overall timeframe — "in 3 months" → end_date ≈ ${todayISO} + 90 days, start_date = ${todayISO}. A short, focused 1-2 week sub-goal is just as valid as a multi-month one when that's genuinely what fits the ask — don't default everything to a month out of habit.

Priority Assignment Rules:
1 (Critical) = Main event requirement (e.g., distance for 200km gran fondo)
2 (High) = Supporting fitness (e.g., elevation for climbing event)
3 (Medium) = Technique/efficiency work
4-5 (Low) = Optional/recovery goals

═══════════════════════════════════════════════════════════════════
📋 STEP 6: OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════════
Generate PURE JSON ONLY:

CRITICAL JSON FORMATTING RULES:
1. NO markdown code blocks (triple backticks)
2. NO comments inside JSON (slashes with slashes or slash-star)
3. NO trailing commas
4. NO extra text before/after JSON
5. Use actual numbers, not placeholders like [NUMBER]
6. PURE, VALID JSON ONLY

TIER CLASSIFICATION (required):
Classify using BOTH absolute difficulty AND relative to this rider's stats above. Use the HIGHER of the two.

ABSOLUTE FLOOR (applies to everyone regardless of level):
- Single ride 200+ km OR 5000+ m elevation day → at least "legendary"
- Single ride 150+ km OR 3000+ m elevation → at least "epic"  
- Single ride/event 100-149 km OR 2000+ m elevation → at least "grand"

RELATIVE ADJUSTMENT (compare to rider's avg distance per ride from stats):
- Goal ≤ 1.5x rider's average single ride → "base"
- Goal ~2x rider's average → "grand" minimum
- Goal ~3x+ rider's average → "epic" minimum

FINAL TIER = max(absolute floor, relative assessment).

EXAMPLES for advanced rider (avg 90km/ride):
- "65km ride" → base (below avg, absolute < 100km)
- "150km ride" → epic (absolute: 150km, relative: ~1.7x → grand, max = epic)
- "200km single ride" → legendary (absolute: 200km+)
- "500km weekly volume" → epic (massive volume commitment)
- "ride 3x/week consistency" → base (routine building)

EXAMPLES for beginner (avg 25km/ride):
- "50km ride" → grand (relative: 2x, absolute < 100km → grand)
- "100km ride" → epic (relative: 4x → epic, absolute: 100km → grand, max = epic)

DEFAULT is "base" for routine, maintenance, and casual goals.

⚠️ MANDATORY: The "tier" field inside "metaGoal" is REQUIRED. You MUST include it. Valid values: "legendary", "epic", "grand", "base".
A 1000km goal = "legendary". A 200km goal = "legendary". A 150km goal = "epic". A casual 60km goal for advanced rider = "base".

═══════════════════════════════════════════════════════════════════
🏷️ FOCUS TAGS (metaGoal.focusTags) — REQUIRED
═══════════════════════════════════════════════════════════════════
Tag the OVERALL THEME of this goal — why the rider wants it — NOT which metrics you happened to pick for the sub-goals. Distance/elevation/speed sub-goals show up in nearly every goal regardless of theme, so tagging by goal_type would make everything look like a duplicate of everything else. Pick 1-3 tags from this EXACT list that best describe the goal's real focus:

climbing, sprint, endurance, tempo, power, ftp, attack, discipline, heart_rate, cadence, race_prep, weight_loss, general_fitness, recovery

Guidance:
- A specific mountain/climbing event or "improve my climbing" → ["climbing"]
- A sprint/criterium focus → ["sprint", "attack"]
- A gran fondo or century ride → ["endurance", "race_prep"]
- "Build my FTP" / threshold-focused → ["ftp", "power"]
- "Ride more consistently" / habit-building → ["discipline"]
- A specific race or event with a date → include "race_prep" alongside whatever the event's terrain theme is
- Weight/body-composition goals → ["weight_loss"]
- Vague/general "get fitter" → ["general_fitness"]
Multiple genuinely distinct goals CAN and SHOULD share a tag (e.g. two different mountains are both "climbing") — that's expected, not an error.

CORRECT EXAMPLE:
{
  "metaGoal": {
    "title": "Concise event/goal name (max 60 chars)",
    "description": "ONE sentence with terrain focus (max 120 chars)",
    "tier": "epic",
    "focusTags": ["climbing", "endurance"]
  },
  "subGoals": [
    {
      "title": "Specific, action-oriented title",
      "description": "Clear description with context",
      "metric": { "source": "activity", "aggregate": "sum", "field": "distance", "transform": 0.001 },
      "target_value": 420,
      "unit": "km",
      "start_date": "${todayISO}",
      "end_date": "${in4w}",
      "priority": 1,
      "reasoning": "Why this goal matters for the terrain/event"
    }
  ],
  "timeline": "X-week periodization overview",
  "mainFocus": "Primary training systems"
}

REMINDER: "tier" field in metaGoal is MANDATORY. Do NOT omit it. Classify based on the rules above.
REMINDER: "focusTags" field in metaGoal is MANDATORY. Use ONLY tags from the list above — 1 to 3 of them.
NOTE: Do NOT include a "trainingTypes" field — training plans now come from the coach directly through the calendar, not a static list baked into the goal.

═══════════════════════════════════════════════════════════════════
✂️ SUB-GOAL TITLES/DESCRIPTIONS — DON'T ECHO THE META-GOAL NAME
═══════════════════════════════════════════════════════════════════
The rider already sees the meta-goal's own title and description once, at the top of the screen. Every sub-goal below it is rendered as its own card, so restating the meta-goal's subject (event name, ride type, theme words) in each sub-goal's title/description is pure noise — it reads as robotic and repetitive when a rider scans 4-6 cards in a row.
BAD (meta-goal "Recovery Ride Routine"): sub-goal titles "Recovery Ride Frequency", "Recovery Ride Speed", "Heart Rate During Recovery Rides" — "recovery ride(s)" repeated in every single one.
GOOD (same goal): "Ride Frequency", "Easy-Pace Speed Cap", "Heart Rate Ceiling" — each title names ONLY the metric/skill itself; the shared context (that these are all in service of the recovery-ride goal) is already obvious from being grouped under that meta-goal, no need to spell it out every time.
Same rule for descriptions: don't restate "for your recovery rides" / "during your Dolomites trip" etc. in every single sub-goal description — say what the number itself means (e.g. "Keep effort easy enough to aid recovery" beats "Keep effort easy during recovery rides for your recovery ride goal").

WRONG EXAMPLES (will cause parsing errors):
WRONG: "target_value": 360 with inline comment
WRONG: trailing commas before closing braces
WRONG: markdown code blocks wrapping JSON

═══════════════════════════════════════════════════════════════════
VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════════
Before outputting:
- Terrain analysis applied? (Mountains = power/elevation, Flat = speed/volume)
- Goals are 20-30% above current performance?
- 4-6 sub-goals created with VARIED metrics (mix activity/skills/coach sources where the goal calls for it, not just activity)?
- Priorities logically assigned (1 = critical)?
- MetaGoal description is ONE sentence under 120 chars?
- Reasoning explains terrain-specific benefit?
- Output is pure JSON (no markdown blocks)?
- Every sub-goal has a "metric" object matching one of the 4 source shapes above, plus start_date/end_date?
- No "trainingTypes" field anywhere in the output?
- No sub-goal title/description repeats the meta-goal's own subject/theme words — each names only its own metric?

AVOID NEAR-DUPLICATE SUB-GOALS WITHIN THIS SAME RESPONSE:
Two sub-goals with the identical metric object (same source/aggregate/field/filter) AND overlapping start_date/end_date measure the same thing twice — pointless. Vary the aggregate, field, filter, or date range so each sub-goal actually adds information (e.g. total distance AND a separate long-ride count are both "activity" source but distinct and both useful).

═══════════════════════════════════════════════════════════════════
🎓 EXAMPLE: Mountain Goal (Dolomites)
═══════════════════════════════════════════════════════════════════
Goal: "I want to ride long ride in Dolomites"
Analysis: Mountain region → Focus on ELEVATION, POWER, CLIMBING (AGGRESSIVE TARGETS)
Output:
{
  "metaGoal": {
    "title": "Dolomites Alpine Challenge",
    "description": "Conquer extended climbs with sustained power and endurance.",
    "tier": "epic",
    "focusTags": ["climbing", "endurance"]
  },
  "subGoals": [
    {"title": "Alpine Elevation Gain", "metric": {"source": "activity", "aggregate": "sum", "field": "total_elevation_gain"}, "target_value": 6500, "unit": "m", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 1, "reasoning": "Prepare for 2000-3000m daily elevation in Dolomites - serious mountain capacity"},
    {"title": "Sustained Climbing Power", "metric": {"source": "activity", "aggregate": "avg", "field": "average_watts"}, "target_value": 240, "unit": "W", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 1, "reasoning": "Maintain threshold power on 30-60min alpine ascents (Passo Giau, Sella)"},
    {"title": "Hill Climbing Speed", "metric": {"source": "activity", "aggregate": "avg", "field": "average_speed", "transform": 3.6, "filter": {"min_distance": 3000, "min_elevation_rate": 0.015}}, "target_value": 16, "unit": "km/h", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "Target 15-18 km/h on sustained 6-8% gradients typical of Dolomite passes"},
    {"title": "Long Alpine Rides", "metric": {"source": "activity", "aggregate": "count", "filter": {"min_distance": 50000}}, "target_value": 3, "unit": "rides", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "Build endurance for 5-7 hour mountain days with 3-4 major climbs"},
    {"title": "VO₂max Climbing Intervals", "metric": {"source": "activity", "aggregate": "count_where", "filter": {"name_contains": ["interval", "vo2max", "sprint"]}}, "target_value": 2, "unit": "workouts", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 3, "reasoning": "Develop explosive power for steep ramps (10-15%) on Dolomite climbs"},
    {"title": "Weekly Training Distance", "metric": {"source": "activity", "aggregate": "sum", "field": "distance", "transform": 0.001}, "target_value": 320, "unit": "km", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "Build overall ride volume - 80km average rides in mountainous terrain"}
  ],
  "timeline": "12-week mountain-specific progressive build",
  "mainFocus": "High-volume climbing, sustained threshold power, multi-hour endurance"
}

═══════════════════════════════════════════════════════════════════
🎓 EXAMPLE: Flat/Speed Goal (Holland)
═══════════════════════════════════════════════════════════════════
Goal: "I want to ride long ride in Holland"
Analysis: Flat region → Focus on SPEED, DISTANCE, AEROBIC EFFICIENCY
Output:
{
  "metaGoal": {
    "title": "Dutch Flats Speed Challenge",
    "description": "Build sustained speed and endurance on flat terrain.",
    "tier": "grand",
    "focusTags": ["endurance"]
  },
  "subGoals": [
    {"title": "Flat Terrain Speed", "metric": {"source": "activity", "aggregate": "avg", "field": "average_speed", "transform": 3.6, "filter": {"min_distance": 3000, "max_elevation_rate": 0.02, "max_elevation": 500}}, "target_value": 32, "unit": "km/h", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 1, "reasoning": "Target competitive pace on Dutch flat roads"},
    {"title": "Weekly Volume", "metric": {"source": "activity", "aggregate": "sum", "field": "distance", "transform": 0.001}, "target_value": 400, "unit": "km", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 1, "reasoning": "Build aerobic base for sustained high-speed efforts"},
    {"title": "Sustained Power Output", "metric": {"source": "activity", "aggregate": "avg", "field": "average_watts"}, "target_value": 200, "unit": "W", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "Maintain threshold power for hours-long speed"},
    {"title": "High-Cadence Efficiency", "metric": {"source": "activity", "aggregate": "avg", "field": "average_cadence"}, "target_value": 92, "unit": "RPM", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 3, "reasoning": "Optimize cadence for flat terrain efficiency"},
    {"title": "Long Endurance Rides", "metric": {"source": "activity", "aggregate": "count", "filter": {"min_distance": 50000}}, "target_value": 3, "unit": "rides", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "Build capacity for 150-200km rides at pace"}
  ],
  "timeline": "10-week speed-endurance progression",
  "mainFocus": "Sustained speed, aerobic threshold, high-volume training"
}

═══════════════════════════════════════════════════════════════════
🎓 EXAMPLE: Non-metric goals (skill / recovery / habit)
═══════════════════════════════════════════════════════════════════
Goal: "I want to improve my sprint and get more consistent about riding regularly"
Output subGoals (illustrative — mix sources freely when the goal calls for it):
{"title": "Sprint & Attack Skill", "metric": {"source": "skills", "skill": "sprint"}, "target_value": 60, "unit": "score", "start_date": "${todayISO}", "end_date": "${in9w}", "priority": 1, "reasoning": "Develop explosive power and attack capability"}
{"title": "Weekly Ride Consistency", "metric": {"source": "activity", "aggregate": "count"}, "target_value": 16, "unit": "rides", "start_date": "${todayISO}", "end_date": "${in4w}", "priority": 2, "reasoning": "4 rides/week × 4 weeks builds the habit"}
Goal: "Help me recover better between hard sessions"
{"title": "Resting Heart Rate", "metric": {"source": "health", "health_metric": "resting_hr"}, "target_value": 55, "unit": "bpm", "start_date": "${todayISO}", "end_date": "${in13w}", "priority": 2, "reasoning": "Lower resting HR indicates improved recovery"}
Goal: "Work on my descending confidence"
{"title": "Descending Technique", "metric": {"source": "coach"}, "target_value": 100, "unit": "%", "start_date": "${todayISO}", "end_date": "${in9w}", "priority": 3, "reasoning": "Qualitative skill — coach assesses through ride reports and conversation"}

NOW APPLY THIS FRAMEWORK TO THE USER'S GOAL ABOVE.
`;

  // Пробуем модели в порядке приоритета (проверенные + бюджетные)
  const modelsToTry = [
    'gpt-4o-mini',      // 1️⃣ Основная: проверенная, стабильная (~$0.60/M output)
    'gpt-5-nano',       // 2️⃣ Бюджетная: самая дешевая ($0.40/M output)
    'gpt-4.1-nano'      // 3️⃣ Запасная: тоже работает
  ];
  
  let response;
  let lastError;
  
  for (const model of modelsToTry) {
    try {
      console.log(`🤖 Trying model: ${model}`);
      response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
      console.log(`✅ Success with model: ${model}`);
      break; // Успешно - выходим из цикла
    } catch (modelError) {
      console.warn(`⚠️ Model ${model} failed:`, modelError.message);
      lastError = modelError;
      continue; // Пробуем следующую модель
    }
  }
  
  // Если ни одна модель не сработала
  if (!response) {
    console.error('❌ All models failed. Last error:', lastError);
    throw lastError || new Error('All AI models failed');
  }
  
  try {

    const content = response.choices[0].message.content.trim();
    
    // Парсим JSON (удаляем markdown блоки и комментарии если GPT добавил)
    let parsedResponse;
    try {
      // Убираем возможные markdown code blocks
      let jsonString = content.match(/\{[\s\S]*\}/)?.[0] || content;
      
      // 🧹 Удаляем комментарии из JSON (AI иногда их добавляет)
      // Удаляем однострочные комментарии: // comment
      jsonString = jsonString.replace(/\/\/[^\n]*/g, '');
      // Удаляем многострочные комментарии: /* comment */
      jsonString = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');
      // Удаляем trailing commas перед закрывающими скобками
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
      
      parsedResponse = JSON.parse(jsonString);
    } catch (e) {
      console.error('❌ Failed to parse AI response:', content);
      console.error('Parse error:', e.message);
      throw new Error('Invalid AI response format. Please try again.');
    }

    // Проверяем, отклонил ли AI запрос как нерелевантный
    if (parsedResponse.error === 'INVALID_REQUEST') {
      console.warn('⚠️ AI rejected request as invalid:', userGoalDescription);
      throw new Error(parsedResponse.message || 'This request is not related to cycling or fitness training.');
    }

    // Валидация структуры ответа
    if (!parsedResponse.metaGoal || !parsedResponse.subGoals || !Array.isArray(parsedResponse.subGoals)) {
      throw new Error('Invalid AI response structure');
    }

    // trainingTypes — expected to be ABSENT on every new-style goal now
    // (the prompt no longer asks for them, see md/GOALS_REDESIGN_PLAN_FINAL.md
    // §4 Phase 3 — training plans come from the coach via chat instead of a
    // static library). This used to be a real warning back when the prompt
    // required the model to produce trainingTypes; now it's the expected
    // path on every single call, so no need to log it as a warning anymore.
    if (!parsedResponse.metaGoal.trainingTypes || !Array.isArray(parsedResponse.metaGoal.trainingTypes)) {
      parsedResponse.metaGoal.trainingTypes = [];
    }

    // Валидация focusTags — фильтруем по контролируемому словарю (модель
    // иногда придумывает свои теги или пишет их не в snake_case); если
    // ничего валидного не осталось, откатываемся на "general_fitness"
    // вместо пустого массива, чтобы create_goal (aiCoach.js) всегда имел
    // хоть один тег для мягкой проверки дублей.
    const rawTags = Array.isArray(parsedResponse.metaGoal.focusTags) ? parsedResponse.metaGoal.focusTags : [];
    const validTags = rawTags
      .map((t) => String(t).toLowerCase().trim())
      .filter((t) => FOCUS_TAGS.includes(t));
    if (validTags.length === 0) {
      console.warn('⚠️ No valid focusTags found in metaGoal, defaulting to ["general_fitness"]');
    }
    parsedResponse.metaGoal.focusTags = [...new Set(validTags.length > 0 ? validTags : ['general_fitness'])].slice(0, 3);

    // Валидация tier — если AI не вернул, выводим из контекста
    if (!parsedResponse.metaGoal.tier || !['legendary', 'epic', 'grand', 'base'].includes(parsedResponse.metaGoal.tier)) {
      if (parsedResponse.tier && ['legendary', 'epic', 'grand', 'base'].includes(parsedResponse.tier)) {
        parsedResponse.metaGoal.tier = parsedResponse.tier;
      } else {
        // Fallback: выводим tier из описания цели и подцелей
        const desc = (userGoalDescription || '').toLowerCase();
        const title = (parsedResponse.metaGoal.title || '').toLowerCase();
        const combined = `${desc} ${title}`;
        const distGoal = (parsedResponse.subGoals || []).find(s => s.goal_type === 'distance');
        const elevGoal = (parsedResponse.subGoals || []).find(s => s.goal_type === 'elevation');
        const distVal = distGoal ? parseFloat(distGoal.target_value) || 0 : 0;
        const elevVal = elevGoal ? parseFloat(elevGoal.target_value) || 0 : 0;

        // Извлечение km из текста цели
        const kmMatch = combined.match(/(\d+)\s*(?:km|км)/);
        const kmFromText = kmMatch ? parseInt(kmMatch[1]) : 0;
        const maxDist = Math.max(distVal, kmFromText);

        let inferredTier = 'base';
        if (maxDist >= 200 || elevVal >= 5000) inferredTier = 'legendary';
        else if (maxDist >= 150 || elevVal >= 3000) inferredTier = 'epic';
        else if (maxDist >= 100 || elevVal >= 2000) inferredTier = 'grand';

        // Также сравниваем с avg rider stats если есть
        if (recentStats?.avgDistance && maxDist > 0) {
          const ratio = maxDist / recentStats.avgDistance;
          if (ratio >= 3 && inferredTier === 'base') inferredTier = 'epic';
          else if (ratio >= 2 && inferredTier === 'base') inferredTier = 'grand';
        }

        console.warn(`⚠️ AI did not return tier. Inferred "${inferredTier}" from context (dist=${maxDist}, elev=${elevVal})`);
        parsedResponse.metaGoal.tier = inferredTier;
      }
    }
    console.log(`🏷️ AI tier final: "${parsedResponse.metaGoal.tier}"`);

    // Валидация каждой подцели — новые цели несут `metric` (проверяется
    // через validateMetric из goalCalculator.js, единый источник правды для
    // формы metric и на генерации, и на исполнении); `goal_type` остаётся
    // как legacy fallback на случай если модель когда-то всё же вернёт
    // старый формат (промпт больше не упоминает goal_type, так что это
    // просто защитная сетка, а не ожидаемый путь).
    parsedResponse.subGoals.forEach((goal, index) => {
      const hasValidMetric = !!goal.metric && validateMetric(goal.metric);
      const hasLegacyType = !!goal.goal_type;
      if ((!hasValidMetric && !hasLegacyType) || !goal.unit || goal.priority === undefined) {
        throw new Error(
          `Invalid sub-goal structure at index ${index}` +
          (goal.metric ? ` (metric failed validation: ${JSON.stringify(goal.metric)})` : ' (no metric or goal_type)')
        );
      }
    });

    // ⚠️ Автоматическое удаление дубликатов. New metric-based goals dedupe on
    // the metric shape + date range (two sub-goals measuring the exact same
    // thing over the exact same window are redundant); legacy fallback keeps
    // the old goal_type+period key.
    const seenCombinations = new Set();
    const uniqueSubGoals = [];

    parsedResponse.subGoals.forEach((goal, index) => {
      const key = goal.metric
        ? `${JSON.stringify(goal.metric)}|${goal.start_date}|${goal.end_date}`
        : `${goal.goal_type}|${goal.period}`;
      if (!seenCombinations.has(key)) {
        seenCombinations.add(key);
        uniqueSubGoals.push(goal);
      } else {
        console.warn(`⚠️ Duplicate sub-goal removed at index ${index}: ${key}`);
      }
    });

    parsedResponse.subGoals = uniqueSubGoals;

    console.log('✅ AI Goals generated successfully:', {
      metaGoalTitle: parsedResponse.metaGoal.title,
      tier: parsedResponse.metaGoal.tier,
      subGoalsCount: parsedResponse.subGoals.length,
      trainingTypesCount: parsedResponse.metaGoal.trainingTypes.length
    });

    return parsedResponse;
  } catch (error) {
    console.error('❌ Error in generateGoalsWithAI:', error);
    throw error;
  }
}

/**
 * Анализирует тренды производительности (рост/падение метрик)
 * @param {Array} activities - Массив активностей (отсортированных по дате)
 * @returns {object} - Тренды и динамика
 */
function analyzePerformanceTrends(activities) {
  if (!activities || activities.length < 8) {
    return {
      distanceTrend: 'insufficient_data',
      elevationTrend: 'insufficient_data',
      speedTrend: 'insufficient_data',
      consistency: 'unknown'
    };
  }

  // Сортируем активности по дате (старые -> новые)
  const sorted = [...activities].sort((a, b) => 
    new Date(a.start_date) - new Date(b.start_date)
  );

  // Делим на две половины для сравнения
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const calcAvg = (arr, field, multiplier = 1) => {
    const valid = arr.filter(a => a[field]);
    if (valid.length === 0) return 0;
    return valid.reduce((sum, a) => sum + a[field] * multiplier, 0) / valid.length;
  };

  // Вычисляем средние для каждой половины
  const firstDistance = calcAvg(firstHalf, 'distance', 1/1000); // km
  const secondDistance = calcAvg(secondHalf, 'distance', 1/1000);
  const firstElevation = calcAvg(firstHalf, 'total_elevation_gain');
  const secondElevation = calcAvg(secondHalf, 'total_elevation_gain');
  const firstSpeed = calcAvg(firstHalf, 'average_speed', 3.6); // km/h
  const secondSpeed = calcAvg(secondHalf, 'average_speed', 3.6);

  // Вычисляем % изменения
  const distanceChange = firstDistance > 0 ? ((secondDistance - firstDistance) / firstDistance * 100) : 0;
  const elevationChange = firstElevation > 0 ? ((secondElevation - firstElevation) / firstElevation * 100) : 0;
  const speedChange = firstSpeed > 0 ? ((secondSpeed - firstSpeed) / firstSpeed * 100) : 0;

  // Анализ консистентности (активностей в неделю)
  const daysDiff = (new Date(sorted[sorted.length - 1].start_date) - new Date(sorted[0].start_date)) / (1000 * 60 * 60 * 24);
  const ridesPerWeek = (activities.length / daysDiff * 7).toFixed(1);

  return {
    distanceTrend: {
      change: parseFloat(distanceChange.toFixed(1)),
      direction: distanceChange > 5 ? 'growing' : distanceChange < -5 ? 'declining' : 'stable',
      firstHalf: parseFloat(firstDistance.toFixed(1)),
      secondHalf: parseFloat(secondDistance.toFixed(1))
    },
    elevationTrend: {
      change: parseFloat(elevationChange.toFixed(1)),
      direction: elevationChange > 5 ? 'growing' : elevationChange < -5 ? 'declining' : 'stable',
      firstHalf: Math.round(firstElevation),
      secondHalf: Math.round(secondElevation)
    },
    speedTrend: {
      change: parseFloat(speedChange.toFixed(1)),
      direction: speedChange > 3 ? 'improving' : speedChange < -3 ? 'declining' : 'stable',
      firstHalf: parseFloat(firstSpeed.toFixed(1)),
      secondHalf: parseFloat(secondSpeed.toFixed(1))
    },
    consistency: {
      ridesPerWeek: parseFloat(ridesPerWeek),
      rating: ridesPerWeek >= 4 ? 'excellent' : ridesPerWeek >= 3 ? 'good' : ridesPerWeek >= 2 ? 'moderate' : 'low'
    }
  };
}

/**
 * Определяет сильные и слабые стороны на основе активностей
 * @param {Array} activities - Массив активностей
 * @param {object} userProfile - Профиль пользователя
 * @returns {object} - Сильные/слабые стороны
 */
function identifyStrengthsAndWeaknesses(activities, userProfile = {}) {
  if (!activities || activities.length === 0) {
    return {
      strengths: [],
      weaknesses: [],
      recommendations: []
    };
  }

  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  // Анализ дистанции
  const avgDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0) / activities.length / 1000;
  const longRides = activities.filter(a => (a.distance / 1000) > 80).length;
  const longRidePercent = (longRides / activities.length * 100);

  if (longRidePercent > 20) {
    strengths.push('Strong endurance base - frequent long rides (80+ km)');
  } else if (longRidePercent < 5) {
    weaknesses.push('Limited long ride experience - need more 80+ km rides');
    recommendations.push('Gradually increase weekly long ride distance');
  }

  // Анализ набора высоты
  const avgElevationPerKm = activities.reduce((sum, a) => {
    const dist = a.distance / 1000;
    return sum + ((a.total_elevation_gain || 0) / (dist || 1));
  }, 0) / activities.length;

  if (avgElevationPerKm > 15) {
    strengths.push('Excellent climbing volume - consistent hilly rides');
  } else if (avgElevationPerKm < 8) {
    weaknesses.push('Low elevation gain per ride - limited climbing exposure');
    recommendations.push('Incorporate more climbing-focused routes');
  }

  // Анализ интенсивности (HR или мощность)
  const activitiesWithHR = activities.filter(a => a.average_heartrate);
  if (activitiesWithHR.length > activities.length * 0.7) {
    strengths.push('Consistent HR monitoring - good data quality');
  }

  const activitiesWithPower = activities.filter(a => a.average_watts);
  if (activitiesWithPower.length < activities.length * 0.3 && userProfile.ftp) {
    weaknesses.push('Limited power meter usage - missing valuable training data');
  }

  // Анализ скорости
  const avgSpeed = activities.reduce((sum, a) => sum + (a.average_speed || 0) * 3.6, 0) / activities.length;
  if (avgSpeed > 28) {
    strengths.push('High average speed capability');
  } else if (avgSpeed < 22) {
    recommendations.push('Focus on tempo rides to improve sustained speed');
  }

  // Анализ консистентности
  const daysDiff = (new Date(activities[0].start_date) - new Date(activities[activities.length - 1].start_date)) / (1000 * 60 * 60 * 24);
  const ridesPerWeek = Math.abs(activities.length / daysDiff * 7);
  
  if (ridesPerWeek >= 4) {
    strengths.push(`Excellent training consistency (${ridesPerWeek.toFixed(1)} rides/week)`);
  } else if (ridesPerWeek < 2.5) {
    weaknesses.push(`Inconsistent training frequency (${ridesPerWeek.toFixed(1)} rides/week)`);
    recommendations.push('Increase weekly ride frequency for better adaptation');
  }

  return {
    strengths,
    weaknesses,
    recommendations,
    metrics: {
      avgDistance: parseFloat(avgDistance.toFixed(1)),
      avgElevationPerKm: parseFloat(avgElevationPerKm.toFixed(1)),
      avgSpeed: parseFloat(avgSpeed.toFixed(1)),
      longRidePercent: parseFloat(longRidePercent.toFixed(1)),
      ridesPerWeek: parseFloat(ridesPerWeek.toFixed(1))
    }
  };
}

/**
 * Вычисляет статистику пользователя за указанный период
 * @param {Array} activities - Массив активностей
 * @param {string} period - Период (3m, 6m, year)
 * @returns {object} - Статистика
 */
function calculateRecentStats(activities, period = '3m') {
  if (!activities || activities.length === 0) {
    return {
      avgDistance: 0,
      avgSpeed: 0,
      totalRides: 0,
      avgHR: 0,
      totalDistance: 0,
      totalElevation: 0
    };
  }

  // Определяем дату начала периода
  const now = new Date();
  const periodDays = {
    '3m': 92,
    '6m': 183,
    'year': 365
  };
  const days = periodDays[period] || 92;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Фильтруем активности по периоду
  const periodActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate >= startDate;
  });

  if (periodActivities.length === 0) {
    return {
      avgDistance: 0,
      avgSpeed: 0,
      totalRides: 0,
      avgHR: 0,
      totalDistance: 0,
      totalElevation: 0
    };
  }

  // Вычисляем статистику
  const totalDistance = periodActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000; // в км
  const totalElevation = periodActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
  
  const activitiesWithSpeed = periodActivities.filter(a => a.average_speed);
  const avgSpeed = activitiesWithSpeed.length > 0
    ? activitiesWithSpeed.reduce((sum, a) => sum + a.average_speed * 3.6, 0) / activitiesWithSpeed.length
    : 0;

  const activitiesWithHR = periodActivities.filter(a => a.average_heartrate);
  const avgHR = activitiesWithHR.length > 0
    ? activitiesWithHR.reduce((sum, a) => sum + a.average_heartrate, 0) / activitiesWithHR.length
    : 0;

  return {
    avgDistance: parseFloat((totalDistance / periodActivities.length).toFixed(2)),
    avgSpeed: parseFloat(avgSpeed.toFixed(1)),
    totalRides: periodActivities.length,
    avgHR: Math.round(avgHR),
    totalDistance: parseFloat(totalDistance.toFixed(2)),
    totalElevation: Math.round(totalElevation)
  };
}

module.exports = {
  generateGoalsWithAI,
  calculateRecentStats,
  analyzePerformanceTrends,
  identifyStrengthsAndWeaknesses,
  FOCUS_TAGS,
};

