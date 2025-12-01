const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Генерирует мета-цель и подцели на основе описания пользователя
 * @param {string} userGoalDescription - Описание цели от пользователя
 * @param {object} userProfile - Профиль пользователя
 * @param {object} recentStats - Статистика за последние 3 месяца
 * @param {object} trends - Анализ трендов производительности (опционально)
 * @param {object} analysis - Анализ сильных/слабых сторон (опционально)
 * @returns {Promise<object>} - { metaGoal, subGoals, timeline, mainFocus }
 */
async function generateGoalsWithAI(userGoalDescription, userProfile = {}, recentStats = {}, trends = null, analysis = null) {
  const prompt = `
You are an expert cycling coach using a structured decision framework to create challenging, personalized training plans.

═══════════════════════════════════════════════════════════════════
🎯 USER'S GOAL: "${userGoalDescription}"
═══════════════════════════════════════════════════════════════════

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
🎯 STEP 5: GOAL TYPE SELECTION MATRIX
═══════════════════════════════════════════════════════════════════
Available goal_types:
- distance: Total km over period
- elevation: Total elevation gain (m)
- time: Total moving time (hours)
- speed_flat: Avg speed on flat (km/h) 
- speed_hills: Avg speed on hills (km/h)
- avg_power: Average power (W)
- cadence: Average cadence (RPM)
- long_rides: Count of long rides
- intervals: Count of interval workouts
- recovery: Count of recovery rides

Periods: 4w (short-term), 3m (medium-term), year (long-term)

Priority Assignment Rules:
1 (Critical) = Main event requirement (e.g., distance for 200km gran fondo)
2 (High) = Supporting fitness (e.g., elevation for climbing event)
3 (Medium) = Technique/efficiency work
4-5 (Low) = Optional/recovery goals

═══════════════════════════════════════════════════════════════════
⚠️ CRITICAL: TITLE MUST MATCH GOAL_TYPE
═══════════════════════════════════════════════════════════════════
The goal TITLE must accurately reflect what the goal_type measures:

CORRECT Examples (title matches goal_type):
✓ {"title": "Weekly Distance Volume", "goal_type": "distance"} → measures total km
✓ {"title": "Climbing Elevation Gain", "goal_type": "elevation"} → measures vertical meters
✓ {"title": "Flat Terrain Speed", "goal_type": "speed_flat"} → measures speed on flats
✓ {"title": "Hill Climbing Speed", "goal_type": "speed_hills"} → measures speed on climbs
✓ {"title": "Long Endurance Rides", "goal_type": "long_rides"} → counts rides
✓ {"title": "Weekly Training Time", "goal_type": "time"} → measures hours

WRONG Examples (misleading titles):
✗ {"title": "Weekly Climb Volume", "goal_type": "distance"} 
   PROBLEM: "Climb" implies elevation, but "distance" just counts km on ANY terrain!
   FIX: Use "Weekly Distance Volume" or change to goal_type="elevation"

✗ {"title": "Climbing Distance", "goal_type": "distance"}
   PROBLEM: Confusing - sounds like vertical meters but measures horizontal km
   FIX: Use "Weekly Training Distance" or change to {"title": "Climbing Elevation", "goal_type": "elevation"}

✗ {"title": "Alpine Ride Volume", "goal_type": "distance"}
   PROBLEM: "Alpine" suggests mountains/elevation, but distance measures ANY terrain
   FIX: Use "Weekly Ride Distance" (neutral)

✗ {"title": "Speed Training", "goal_type": "distance"}
   PROBLEM: "Speed" implies speed_flat or intervals, not distance
   FIX: Use {"title": "Flat Terrain Speed", "goal_type": "speed_flat"}

✗ {"title": "Endurance Volume", "goal_type": "elevation"}
   PROBLEM: "Volume" usually means distance or time, not vertical meters
   FIX: Use {"title": "Climbing Elevation Gain", "goal_type": "elevation"}

NAMING RULES:
- If goal_type = "distance" → use: "Distance", "Volume", "Weekly Mileage", "Training Distance"
  NEVER use: "Climb", "Climbing", "Ascent" with distance (those imply elevation!)
- If goal_type = "elevation" → use: "Elevation Gain", "Climbing Volume", "Vertical Gain", "Ascent"
  ALWAYS include: "Elevation", "Vertical", "Climbing", "Ascent" to clarify it measures meters up
- If goal_type = "speed_flat" → use: "Flat Speed", "Cruising Speed", "Tempo Pace on Flats"
- If goal_type = "speed_hills" → use: "Climbing Speed", "Hill Pace", "Ascent Speed"
- If goal_type = "time" → use: "Training Time", "Ride Hours", "Weekly Saddle Time"
- If goal_type = "long_rides" → use: "Long Rides", "Endurance Sessions", "Extended Rides"
- If goal_type = "intervals" → use: "Interval Sessions", "High-Intensity Work", "VO2max Training"

SPECIAL CASE - Mountain terrain with distance goal:
✓ CORRECT: "Weekly Training Distance" (neutral - just measures km)
✗ WRONG: "Weekly Climbing Distance" (confusing - sounds like elevation!)
✗ WRONG: "Alpine Distance Volume" (misleading - alpine implies vertical!)

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

CORRECT EXAMPLE:
{
  "metaGoal": {
    "title": "Concise event/goal name (max 60 chars)",
    "description": "ONE sentence with terrain focus (max 120 chars)",
    "trainingTypes": [
      {
        "type": "hill_climbing",
        "title": "Creative contextual name (2-4 words)",
        "description": "15-20 word specific description for this meta-goal",
        "priority": 1
      },
      {
        "type": "threshold",
        "title": "Another creative name",
        "description": "Contextual description tied to the goal",
        "priority": 2
      },
      {
        "type": "endurance",
        "title": "Third creative name",
        "description": "Another contextual description",
        "priority": 3
      },
      {
        "type": "intervals",
        "title": "Fourth creative name",
        "description": "Final contextual description",
        "priority": 4
      }
    ]
  },
  "subGoals": [
    {
      "title": "Specific, action-oriented title",
      "description": "Clear description with context",
      "goal_type": "distance",
      "target_value": 420,
      "unit": "km",
      "period": "4w",
      "priority": 1,
      "reasoning": "Why this goal matters for the terrain/event"
    }
  ],
  "timeline": "X-week periodization overview",
  "mainFocus": "Primary training systems"
}

═══════════════════════════════════════════════════════════════════
🏋️ TRAINING TYPES LIBRARY
═══════════════════════════════════════════════════════════════════
Choose 4 training types from this list that BEST support the meta-goal.
USE EXACT KEYS from this list (these match our training library):

Available Training Types (use these exact keys):
- sprint: Short max-effort bursts (10-30s, 130-150% FTP)
- tempo: Sustained moderate-high intensity (Z3-Z4, 85-95% FTP)
- threshold: Lactate threshold intervals (Z4, 95-105% FTP)
- sweet_spot: Just below threshold (Z3-Z4, 88-93% FTP)
- intervals: High-intensity VO2max work (Z4-Z5, 105-120% FTP)
- endurance: Long steady aerobic rides (Z2-Z3, 60-75% FTP)
- recovery: Easy spinning for adaptation (Z1-Z2, 50-65% FTP)
- hill_climbing: Repeated climbing efforts (Z3-Z5, 80-110% FTP)
- strength: Low cadence high force intervals (Z3-Z4, 80-95% FTP)
- cadence: High-RPM efficiency work (Z2-Z3, 70-85% FTP)
- over_under: Alternating above/below threshold (Z4-Z5)
- pyramid: Progressive intensity build-ups (Z3-Z5, 90-120% FTP)
- time_trial: Race-pace simulations (Z4, 95-105% FTP)
- group_ride: Social variable intensity rides (Z2-Z4, 70-90% FTP)

TRAINING TYPE SELECTION GUIDELINES:
For MOUNTAIN/CLIMBING goals → prioritize: hill_climbing, threshold, intervals, strength
For FLAT/SPEED goals → prioritize: tempo, threshold, sprint, over_under
For ENDURANCE/DISTANCE goals → prioritize: endurance, tempo, sweet_spot, group_ride
For FTP/POWER goals → prioritize: threshold, sweet_spot, over_under, intervals

For each training type provide:
- type: (EXACT key from list above - e.g., "hill_climbing", not "Hill Repeats")
- title: (creative 2-4 word name specific to THIS meta-goal context)
- description: (15-20 words explaining HOW this supports the meta-goal)
- priority: (1-4, where 1 = most critical for this goal)

EXAMPLES:
For "Mountain Climbing Power":
{
  "type": "hill_climbing",
  "title": "Alpine Power Intervals",
  "description": "5-8 minute sustained climbs at threshold, simulating long mountain ascents with progressive gradient work",
  "priority": 1
}

For "Flat Speed Development":
{
  "type": "tempo",
  "title": "Aero Position Practice",
  "description": "Extended tempo efforts maintaining aerodynamic position to build sustainable flat-terrain speed",
  "priority": 1
}

WRONG EXAMPLES (will cause parsing errors):
WRONG: "target_value": 360 with inline comment
WRONG: "target_value": 250 with inline comment
WRONG: trailing commas before closing braces
WRONG: markdown code blocks wrapping JSON

═══════════════════════════════════════════════════════════════════
VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════════
Before outputting:
- Terrain analysis applied? (Mountains = power/elevation, Flat = speed/volume)
- Goals are 20-30% above current performance?
- 4-6 sub-goals created with VARIED goal_types?
- Priorities logically assigned (1 = critical)?
- MetaGoal description is ONE sentence under 120 chars?
- Reasoning explains terrain-specific benefit?
- NO ftp_vo2max goals created?
- Output is pure JSON (no markdown blocks)?
- TITLE MATCHES GOAL_TYPE? (e.g., "Climb" → elevation, NOT distance)
- Each title accurately describes what the goal_type measures?
- 4 trainingTypes provided with contextual descriptions?
- Training types align with the goal's terrain/focus?
- Each training description is 15-20 words and specific?

CRITICAL - NO DUPLICATE COMBINATIONS:
- Each sub-goal MUST have a UNIQUE combination of (goal_type + period)
- NEVER create two goals with same goal_type and same period
- The system will REJECT the entire response if duplicates are found

Example of INVALID (will be rejected):
  WRONG Goal 1: goal_type=distance, period=4w, target_value=420
  WRONG Goal 2: goal_type=distance, period=4w, target_value=105
  PROBLEM: Both use "distance" + "4w" - system will reject!

Example of VALID (different goal_types OR different periods):
  CORRECT Goal 1: goal_type=distance, period=4w, target_value=420
  CORRECT Goal 2: goal_type=elevation, period=4w, target_value=6500
  CORRECT Goal 3: goal_type=distance, period=3m, target_value=1200
  VALID: Different goal_types OR different periods

IF YOU WANT TO TRACK DISTANCE IN MULTIPLE WAYS:
- Use "distance" for total volume (km): {"goal_type": "distance", "period": "4w"}
- Use "long_rides" for ride count: {"goal_type": "long_rides", "period": "4w"}
- Use "time" for duration (hours): {"goal_type": "time", "period": "4w"}
- Use different period for mid-term: {"goal_type": "distance", "period": "3m"}

NEVER DUPLICATE THE SAME (goal_type + period) PAIR!

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
    "trainingTypes": [
      {"type": "hill_climbing", "title": "Alpine Power Intervals", "description": "5-8 minute sustained climbs at threshold, simulating long mountain ascents with progressive gradient work", "priority": 1},
      {"type": "threshold", "title": "Climbing Threshold", "description": "Extended threshold efforts to build the sustained power needed for 20-30 minute alpine climbs", "priority": 2},
      {"type": "intervals", "title": "Explosive Climbing", "description": "Short high-intensity bursts to develop acceleration out of hairpin turns and steep gradient surges", "priority": 3},
      {"type": "endurance", "title": "Multi-Col Endurance", "description": "4-6 hour rides with multiple climbs to simulate full alpine day with accumulated fatigue", "priority": 4}
    ]
  },
  "subGoals": [
    {"title": "Alpine Elevation Gain", "goal_type": "elevation", "target_value": 6500, "unit": "m", "period": "4w", "priority": 1, "reasoning": "Prepare for 2000-3000m daily elevation in Dolomites - serious mountain capacity"},
    {"title": "Sustained Climbing Power", "goal_type": "avg_power", "target_value": 240, "unit": "W", "period": "4w", "priority": 1, "reasoning": "Maintain threshold power on 30-60min alpine ascents (Passo Giau, Sella)"},
    {"title": "Hill Climbing Speed", "goal_type": "speed_hills", "target_value": 16, "unit": "km/h", "period": "4w", "priority": 2, "reasoning": "Target 15-18 km/h on sustained 6-8% gradients typical of Dolomite passes"},
    {"title": "Long Alpine Rides", "goal_type": "long_rides", "target_value": 3, "unit": "rides", "period": "4w", "priority": 2, "reasoning": "Build endurance for 5-7 hour mountain days with 3-4 major climbs"},
    {"title": "VO₂max Climbing Intervals", "goal_type": "intervals", "target_value": 2, "unit": "workouts", "period": "4w", "priority": 3, "reasoning": "Develop explosive power for steep ramps (10-15%) on Dolomite climbs"},
    {"title": "Weekly Training Distance", "goal_type": "distance", "target_value": 320, "unit": "km", "period": "4w", "priority": 2, "reasoning": "Build overall ride volume - 80km average rides in mountainous terrain"}
  ],
  NOTE: Each goal has UNIQUE (goal_type + period) - NO DUPLICATES!
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
    "trainingTypes": [
      {"type": "tempo", "title": "Aero Position Practice", "description": "Extended tempo efforts maintaining aerodynamic position to build sustainable flat-terrain speed and efficiency", "priority": 1},
      {"type": "threshold", "title": "Sustained Power Blocks", "description": "Long threshold intervals at race pace to develop the ability to maintain high speeds for extended periods", "priority": 2},
      {"type": "sprint", "title": "Breakaway Simulations", "description": "Short max-effort sprints to develop acceleration and high-end power for attacking on flat roads", "priority": 3},
      {"type": "endurance", "title": "Distance Pace Rides", "description": "3-5 hour rides at target pace to build the endurance needed for long flat events", "priority": 4}
    ]
  },
  "subGoals": [
    {"title": "Flat Terrain Speed", "goal_type": "speed_flat", "target_value": 32, "unit": "km/h", "period": "4w", "priority": 1, "reasoning": "Target competitive pace on Dutch flat roads"},
    {"title": "Weekly Volume", "goal_type": "distance", "target_value": 400, "unit": "km", "period": "4w", "priority": 1, "reasoning": "Build aerobic base for sustained high-speed efforts"},
    {"title": "Sustained Power Output", "goal_type": "avg_power", "target_value": 200, "unit": "W", "period": "4w", "priority": 2, "reasoning": "Maintain threshold power for hours-long speed"},
    {"title": "High-Cadence Efficiency", "goal_type": "cadence", "target_value": 92, "unit": "RPM", "period": "4w", "priority": 3, "reasoning": "Optimize cadence for flat terrain efficiency"},
    {"title": "Long Endurance Rides", "goal_type": "long_rides", "target_value": 3, "unit": "rides", "period": "4w", "priority": 2, "reasoning": "Build capacity for 150-200km rides at pace"}
  ],
  NOTE: Each goal has UNIQUE (goal_type + period) - NO DUPLICATES!
  "timeline": "10-week speed-endurance progression",
  "mainFocus": "Sustained speed, aerobic threshold, high-volume training"
}

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

    // Валидация trainingTypes в metaGoal
    if (!parsedResponse.metaGoal.trainingTypes || !Array.isArray(parsedResponse.metaGoal.trainingTypes)) {
      console.warn('⚠️ No trainingTypes found in metaGoal, setting empty array');
      parsedResponse.metaGoal.trainingTypes = [];
    }

    // Валидация каждой подцели
    parsedResponse.subGoals.forEach((goal, index) => {
      if (!goal.goal_type || !goal.unit || goal.priority === undefined) {
        throw new Error(`Invalid sub-goal structure at index ${index}`);
      }
      
      // Для FTP целей проверяем обязательные поля
      if (goal.goal_type === 'ftp_vo2max') {
        if (goal.target_value !== null) {
          console.warn(`⚠️ FTP goal at index ${index} has non-null target_value, setting to null`);
          goal.target_value = null;
        }
        if (!goal.hr_threshold) {
          goal.hr_threshold = userProfile.lactate_threshold || 160;
        }
        if (!goal.duration_threshold) {
          goal.duration_threshold = 120;
        }
      }
    });

    // ⚠️ Проверка на дубликаты (goal_type + period)
    const combinations = new Map();
    parsedResponse.subGoals.forEach((goal, index) => {
      const key = `${goal.goal_type}|${goal.period}`;
      if (combinations.has(key)) {
        const firstIndex = combinations.get(key);
        throw new Error(
          `Duplicate goal combination detected: goal_type="${goal.goal_type}" + period="${goal.period}" ` +
          `at indices ${firstIndex} and ${index}. Each sub-goal must have a unique (goal_type + period) combination.`
        );
      }
      combinations.set(key, index);
    });

    console.log('✅ AI Goals generated successfully:', {
      metaGoalTitle: parsedResponse.metaGoal.title,
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
  identifyStrengthsAndWeaknesses
};

