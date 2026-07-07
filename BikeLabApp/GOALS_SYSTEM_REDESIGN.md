# Goals System — Analysis & Redesign Plan

> Current state audit, identified problems, and concrete improvement plan.

---

## 1. Current Architecture (as-is)

```
MetaGoal (meta_goals table)
├── title, description, target_date, status (active|completed)
├── tier (legendary|epic|grand|base) — cosmetic
├── focus_tags[] — theme tags for soft duplicate detection
├── ai_context.trainingTypes[] — 4 recommended training types
└── SubGoal[] (goals table)
    ├── goal_type — one of 11 hardcoded types
    ├── target_value / current_value
    ├── period — one of 3 hardcoded values (4w|3m|year)
    └── priority (1-5)
```

**Creation flow**: User describes goal in chat → coach calls `create_goal` → `aiGoals.js` sends long prompt to GPT-4o-mini → AI returns structured JSON → server inserts into DB.

**Progress flow**: Client-side `calculateGoalProgress()` filters activities by period, computes metric (sum/avg/count), compares to target.

---

## 2. Problems

### 2.1 Захардкоженные периоды

Только три варианта: `4w` (28 дней), `3m` (92 дня), `year` (365 дней). Нельзя задать:
- Конкретную дату ("к 15 августа")
- Произвольный период ("6 недель", "сезон апрель-октябрь")
- Текущий месяц / текущую неделю

Прогресс считается скользящим окном от `now - period`, а не от `created_at` до `target_date`. Это значит: если цель создана месяц назад с периодом `4w`, через месяц старые тренировки "выпадают" из окна и прогресс падает, хотя ты реально тренировался. Пользователь видит откат прогресса — демотивация.

### 2.2 Ограниченный набор метрик

11 goal_types зашиты в код (`distance`, `elevation`, `time`, `speed_flat`, `speed_hills`, `long_rides`, `intervals`, `pulse`, `cadence`, `avg_power`, `recovery`). Нет:
- **Consistency** — "кататься 4 раза в неделю" (rides/week over period)
- **Streak** — "не пропускать больше 2 дней подряд"
- **Composite** — "3 раза в неделю по 50+ км" (frequency + distance filter)
- **Weight/body** — из Apple Health (вес, HRV, sleep — если APPLE_HEALTH_SPEC реализован)
- **Personal best** — "побить свой рекорд на сегменте / по distance / по elevation за одну поездку"
- **Custom numeric** — пользовательская метрика с ручным вводом

### 2.3 Прогресс только ретроспективный

`calculateGoalProgress` смотрит только назад. Нет:
- **Pace tracking** — "ты на 15% отстаёшь от плана, нужно +20 км/неделю чтобы успеть к дедлайну"
- **Projection** — "при текущем темпе ты достигнешь цели через 6 недель (цель — через 4)"
- **Trend direction** — прогресс растёт или падает?
- **Milestones** — промежуточные чекпоинты (25%, 50%, 75%)

### 2.4 Нет жизненного цикла

Цель создаётся и висит. Нет:
- **Auto-complete** — когда target_value достигнут, цель автоматически завершается (или хотя бы уведомление)
- **Expiry** — когда target_date прошёл, цель просто остаётся active с прошедшей датой
- **Adaptation** — если пользователь перевыполняет на 50%, предложить повысить планку
- **Warning** — если отстаёшь, коуч предлагает пересмотреть план

### 2.5 Tier — только косметика

`legendary/epic/grand/base` красиво выглядит, но ничего не делает. Нет:
- Разблокируемых наград за completed legendary goals
- Влияния на gamification (XP, уровень, лидерборд)
- Прогрессии тиров ("завершил 3 grand → разблокируй epic challenge")

### 2.6 Sub-goals не живут своей жизнью

Sub-goals — это чисто метрики для расчёта общего процента. Нельзя:
- Пометить отдельный sub-goal как completed (только всю мета-цель целиком)
- Видеть тренд по каждому sub-goal
- Получить рекомендацию коуча по конкретному отстающему sub-goal

### 2.7 Training Types не связаны с календарём

`trainingTypes` в `ai_context` — это рекомендации ("делай hill_climbing"), но нет:
- Автоматического планирования тренировок по расписанию
- Периодизации (build → peak → taper)
- Связи "эта тренировка в календаре относится к этой цели"

### 2.8 Генерация — чёрный ящик

Один гигантский промт в `aiGoals.js` (517 строк) генерирует всё разом. Нет:
- Итеративного уточнения ("хочешь сфокусироваться на скорости или выносливости?")
- Учёта существующих целей при генерации новой
- Предложения templates / popular goals

---

## 3. Redesign Plan

### Phase 1 — Fix Periods & Progress (высокий приоритет, ~2 дня)

**Проблема**: Скользящее окно ломает прогресс. Захардкоженные периоды.

**Решение**: Привязать прогресс к `created_at → target_date`, а не к скользящему окну.

#### Изменения в модели

```sql
ALTER TABLE goals ADD COLUMN start_date DATE;
ALTER TABLE goals ADD COLUMN end_date DATE;
-- period остаётся как fallback для legacy целей
```

#### Новая логика прогресса

```typescript
// Вместо скользящего окна:
const start = goal.start_date || goal.created_at;  
const end = goal.end_date || goal.target_date || addPeriod(start, goal.period);
const filteredActivities = activities.filter(a => 
  new Date(a.start_date) >= new Date(start) && 
  new Date(a.start_date) <= new Date(end)
);
```

#### Pace tracking

```typescript
interface GoalPace {
  currentValue: number;
  targetValue: number;
  daysElapsed: number;
  daysRemaining: number;
  requiredPace: number;  // target_value / totalDays — how much per day needed
  actualPace: number;    // currentValue / daysElapsed
  projectedCompletion: number; // days at current pace
  onTrack: boolean;      // actualPace >= requiredPace
  percentBehind: number; // negative = ahead
}
```

Коуч получает `pace` в `get_goals_progress` tool result и может сказать "ты отстаёшь на 15%, нужно добавить одну длинную поездку на этой неделе".

#### AI генерация с произвольным периодом

Убрать ограничение `period: '4w' | '3m' | 'year'` из промта. Вместо этого AI задаёт `start_date` и `end_date` в ISO формате на основе target_date мета-цели. Fallback для legacy: если `start_date/end_date` null, используем старую логику с `period`.

---

### Phase 2 — Расширенные метрики (~2 дня)

#### Новые goal_types

```typescript
// Добавить в calculateGoalProgress:

case 'consistency':
  // Цель: N поездок в неделю на протяжении периода
  // current_value = среднее rides/week
  const weeks = Math.max(1, daysElapsed / 7);
  return filteredActivities.length / weeks;

case 'streak':
  // Цель: максимальная серия дней подряд с тренировкой
  return calculateMaxStreak(filteredActivities);

case 'single_ride_distance':
  // Personal best: самая длинная поездка за период
  return Math.max(...filteredActivities.map(a => (a.distance || 0) / 1000), 0);

case 'single_ride_elevation':
  // Personal best: максимальный набор высоты за одну поездку
  return Math.max(...filteredActivities.map(a => a.total_elevation_gain || 0), 0);

case 'weekly_rides':
  // Количество поездок в неделю (средняя за период)
  const totalWeeks = Math.max(1, daysElapsed / 7);
  return Math.round((filteredActivities.length / totalWeeks) * 10) / 10;
```

#### Обновить промт в aiGoals.js

Добавить новые типы в "GOAL TYPE SELECTION MATRIX" с примерами. Модель сама начнёт их использовать когда пользователь скажет "хочу кататься стабильно 4 раза в неделю" → `goal_type: consistency`.

---

### Phase 3 — Жизненный цикл целей (~2 дня)

#### Auto-complete & notifications

В серверном `calculateGoalProgress` (вызывается при каждом `get_goals_progress`):

```javascript
// После расчёта прогресса каждого sub-goal:
const allSubGoalsComplete = subGoals.every(g => g.current_value >= g.target_value);
if (allSubGoalsComplete && metaGoal.status === 'active') {
  // Не автокомплитим, но добавляем флаг
  result.readyToComplete = true;
  // Коуч видит это и поздравляет
}
```

#### Expired goals

```javascript
if (metaGoal.target_date && new Date(metaGoal.target_date) < new Date() && metaGoal.status === 'active') {
  result.expired = true;
  result.finalProgress = overallProgress;
  // Коуч предлагает: продлить, пересмотреть таргеты, или закрыть
}
```

#### Adaptive targets

Когда `current_value > target_value * 1.3` (перевыполнение на 30%+):

```javascript
result.overachieving = true;
result.suggestedNewTarget = Math.round(current_value * 1.15);
// Коуч: "Ты перевыполнил цель по elevation на 40%! 
//         Хочешь поднять планку с 5000м до 7500м?"
```

#### Системный промпт коуча — расширение

```
## Goal Lifecycle
When reporting goal progress:
- If readyToComplete: congratulate and ask if they want to mark it complete
- If expired: note the deadline passed, suggest extending or closing
- If overachieving on any sub-goal (>130%): suggest raising the target
- If behind pace (>20% behind): suggest plan adjustments
- Always mention pace (on track / behind / ahead) when discussing goals
```

---

### Phase 4 — Sub-goals как самостоятельные единицы (~1 день)

#### Отдельное завершение sub-goals

```sql
ALTER TABLE goals ADD COLUMN status TEXT DEFAULT 'active';
-- 'active' | 'completed' | 'exceeded'
```

В UI (GoalDetailsScreen): каждый sub-goal получает кнопку "✓" когда `current >= target`. Нажатие → `PUT /api/goals/:id { status: 'completed' }`. Завершённые sub-goals визуально отмечаются, но продолжают считать прогресс (чтобы видеть перевыполнение).

#### Sub-goal trends

В `get_goals_progress` добавить тренд для каждого sub-goal:

```javascript
{
  goal_type: 'elevation',
  current_value: 4200,
  target_value: 6000,
  trend: 'growing',     // growing | declining | stable
  weeklyRate: 1050,      // m/week at current pace
  projectedDate: '2026-08-15' // when target will be hit
}
```

---

### Phase 5 — Связь с календарём и периодизация (~2 дня)

> Зависит от реализации CALENDAR_SPEC.md

#### Goal ↔ Calendar Events

Уже подготовлено: `calendar_events.goal_id` (FK to meta_goals) существует по CALENDAR_SPEC. Расширяем:

**Новый coach tool: `plan_training_week`**

```javascript
{
  name: 'plan_training_week',
  description: 'Create a week of training sessions linked to a specific goal. ' +
    'Uses the goal\'s trainingTypes to build a balanced week. ' +
    'Creates calendar_events with goal_id, type=planned_ride, and training type details.',
  parameters: {
    type: 'object',
    properties: {
      goal_id: { type: 'integer' },
      week_start: { type: 'string', description: 'Monday of the week (YYYY-MM-DD)' },
      sessions_count: { type: 'integer', description: 'Number of sessions (3-6)' },
    },
    required: ['goal_id', 'week_start'],
  },
}
```

Коуч использует `trainingTypes` из мета-цели и `pace` данные чтобы составить тренировочную неделю. Каждая тренировка создаётся как `calendar_event` с `goal_id`, `type=planned_ride`, и description содержащим конкретные параметры (зоны, длительность, структуру).

#### Периодизация

В описание мета-цели AI добавляет `phases` (в `ai_context`):

```json
{
  "phases": [
    { "name": "Base Building", "weeks": 4, "focus": "aerobic endurance, volume" },
    { "name": "Build", "weeks": 4, "focus": "intensity, threshold work" },
    { "name": "Peak", "weeks": 2, "focus": "race-specific, tapering volume" },
    { "name": "Taper", "weeks": 1, "focus": "recovery, sharpening" }
  ]
}
```

Коуч при `plan_training_week` смотрит в какой фазе сейчас находится атлет (по дате) и подбирает тренировки соответственно.

---

### Phase 6 — Templates & Guided Creation (~1 день)

#### Popular Goal Templates

Новый coach tool: `suggest_goal_templates`

```javascript
{
  name: 'suggest_goal_templates',
  description: 'Show popular goal templates based on user profile and current performance.',
  parameters: { type: 'object', properties: {}, required: [] }
}
```

Executor собирает данные из профиля и возвращает 4-6 предложений:

```javascript
async suggest_goal_templates(args, { userId }) {
  const profile = await getUserProfile(pool, userId);
  const stats = await getRecentStats(pool, userId, 90);
  
  const templates = [];
  
  // Если ни разу не делал 100км — предложить Century
  if (stats.maxSingleRideDistance < 100) {
    templates.push({
      title: 'First Century Ride',
      description: 'Build up to your first 100km ride',
      tier: 'grand',
      focusTags: ['endurance'],
      estimatedWeeks: 8,
    });
  }
  
  // Если elevation/km < 10 — предложить climbing
  if (stats.avgElevationPerKm < 10 && stats.totalRides > 20) {
    templates.push({
      title: 'Climbing Challenge',
      description: 'Develop your climbing abilities',
      tier: 'epic',
      focusTags: ['climbing', 'power'],
      estimatedWeeks: 12,
    });
  }
  
  // Если consistency < 3 rides/week
  if (stats.ridesPerWeek < 3) {
    templates.push({
      title: 'Build the Habit',
      description: 'Ride consistently 4 times per week',
      tier: 'base',
      focusTags: ['discipline', 'general_fitness'],
      estimatedWeeks: 6,
    });
  }
  
  // Seasonal (если сейчас весна — prep for summer)
  // Event-specific (если в профиле есть target event)
  // ...
  
  return { templates };
}
```

#### Rich card: GoalTemplateSuggestionsCard

В чате коуч при первом создании цели или при "что бы мне поставить?" показывает карточки-шаблоны. Тап → pre-fill в `create_goal`.

---

### Phase 7 — Smart Duplicate & Goal Awareness (~1 день)

#### Учёт существующих целей при создании

Передавать `existingGoals` в промт `generateGoalsWithAI`:

```javascript
const existingGoals = await pool.query(
  `SELECT mg.title, mg.focus_tags, mg.target_date, g.goal_type, g.target_value, g.period
   FROM meta_goals mg
   LEFT JOIN goals g ON g.meta_goal_id = mg.id
   WHERE mg.user_id = $1 AND mg.status = 'active'`,
  [userId]
);

// Добавить в промт:
`
EXISTING ACTIVE GOALS:
${formatExistingGoals(existingGoals.rows)}

IMPORTANT: Do NOT create sub-goals that duplicate existing ones. 
If the user already has an active distance goal of 400km/4w, 
don't create another distance/4w sub-goal. Either use a different period 
or focus on metrics not yet tracked.
`
```

---

## 4. Priority Order

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 1. Fix periods & pace tracking | High — fixes core UX frustration | 2d | **P0** |
| 3. Goal lifecycle (auto-complete, expiry, adaptation) | High — makes goals feel alive | 2d | **P0** |
| 2. Extended metrics (consistency, streak, PB) | Medium — more goal variety | 2d | **P1** |
| 4. Sub-goal autonomy (individual complete, trends) | Medium — better detail view | 1d | **P1** |
| 5. Calendar + periodization | High — but depends on CALENDAR_SPEC | 2d | **P1** |
| 6. Templates & guided creation | Medium — easier onboarding | 1d | **P2** |
| 7. Smart duplicate awareness | Low — current soft-duplicate works OK | 1d | **P2** |

Total: ~11 days of implementation.

---

## 5. Files Affected

### aiGoals.js (server)
- Remove hardcoded periods from prompt
- Add `start_date`/`end_date` to output schema
- Add new goal_types to selection matrix
- Add `existingGoals` context to prompt
- Add `phases` to output (periodization)

### server.js
- Migration: `ALTER TABLE goals ADD COLUMN start_date, end_date, status`
- Update `calculateGoalProgress` — date range instead of sliding window
- Add pace calculation to `get_goals_progress` tool response
- Add lifecycle checks (readyToComplete, expired, overachieving)

### aiCoach.js
- Update system prompt with Goal Lifecycle section
- Add `suggest_goal_templates` tool
- Add `plan_training_week` tool (Phase 5)
- Pass existing goals to `generateGoalsWithAI`

### goalsCache.ts (client)
- Mirror new `calculateGoalProgress` logic (date range)
- Add `GoalPace` interface
- Add new goal_type cases (consistency, streak, single_ride_*)

### GoalDetailsScreen.tsx
- Show pace (on track / behind / ahead) badge
- Show sub-goal trends and projected completion
- Individual sub-goal complete buttons
- Periodization phase indicator (Phase 5)

### MetaGoalCard.tsx
- Show pace indicator (green/yellow/red dot)
- Show "Ready to complete!" badge when all sub-goals met
- Show "Expired" badge when past target_date

### ChatMessageBubble.tsx
- GoalTemplateSuggestionsCard rendering (Phase 6)

### GoalsPanel.tsx
- Add "Expired" filter tab (alongside Active / Completed)
