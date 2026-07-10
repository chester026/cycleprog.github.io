# Редизайн системы целей — финальный план

> Не альтернатива существующим документам, а их сверка с реальным кодом и финальный
> скоуп. Основа — `BikeLabApp/GOALS_REDESIGN_SPEC.md` (уже лежит в репо, "Spec for
> Sonnet"), который решает ровно те 3 проблемы, что были поставлены, без геймификации.
> `md/GOALS_SYSTEM_REDESIGN.md` (ресёрч Opus) — использован только как источник
> отдельных полезных идей (pace tracking, lifecycle-флаги); всё, что за пределами
> трёх проблем (периодизация, шаблоны, тиры/XP), сознательно вырезано — см. §3.

---

## 0. Три проблемы, которые решаем

1. **Цели захардкожены** — 11 `goal_type` в enum, нельзя создать цель на восстановление
   или на скилл (Attack/Climbing и т.д.), если она не входит в список.
2. **Периоды захардкожены** — только `4w | 3m | year`, нельзя задать произвольный
   период (1-2 недели, конкретная дата).
3. **Библиотека тренировок ограничена** — и, возможно, не нужна вовсе, раз коуч уже
   даёт советы по тренировкам в диалоге напрямую.

---

## 1. Что уже решено в `GOALS_REDESIGN_SPEC.md` (подтверждено по коду)

**Декларативная модель метрики** вместо enum:

```typescript
interface GoalMetric {
  source: 'activity' | 'skills' | 'health' | 'coach';
  aggregate?: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'count_where' | 'median';
  field?: string;          // distance, total_elevation_gain, average_speed, ...
  transform?: number;
  filter?: ActivityFilter; // min_distance, max_elevation_rate, name_contains, ...
  skill?: 'climbing' | 'sprint' | 'endurance' | 'tempo' | 'power' | 'consistency';
  health_metric?: 'hrv' | 'resting_hr' | 'sleep_hours' | 'weight';
}
```

Это закрывает **проблему 1** полностью: любая цель, которую можно свести к
sum/avg/max/count по данным активности, к скилл-скору (0-100, реально существующие
6 полей в `skills_history`) или к health-метрике — становится создаваемой без правки
кода. Для качественных целей (техника, уверенность на спусках), которые ни к чему
из этого не сводятся, есть `source: 'coach'` — коуч сам двигает `current_value` через
`update_goal`, оставаясь в рамках 0-100%.

**`start_date` + `end_date` вместо `period` enum** — закрывает **проблему 2**: любая
длина периода, включая 1-2 недели, конкретные даты дедлайна.

**Депрекейт training-types.json** в пользу "спроси коуча" (кнопка в Trainings tab,
открывает чат с заготовленным промптом) — закрывает **проблему 3**. Библиотека не
удаляется физически (legacy-цели её ещё используют), но новые цели её не генерируют.

Схема БД, промпт AI, universal calculator, миграция ALTER — всё расписано в спеке
по разделам 1-7, реализация не требует переписывания оттуда, только точечных правок
ниже.

---

## 2. Что нужно скорректировать при реализации

Спек писался до Apple Health интеграции и не по всем местам сверен с текущим
кодом. Пять поправок:

### 2.1 `health`-source не может считаться на сервере как `activity`/`skills`

Спек предполагает единый `calculateProgress(goal, activities, skillsSnapshot,
healthData)` — как будто healthData такой же серверный аргумент, как активности.
Но health-данные в этом приложении принципиально **client-only**: `healthContext`
собирается на устройстве (`buildHealthContext()`) и осознанно никогда не попадает в
Postgres — это сквозной архитектурный принцип, на котором построена вся Apple
Health/Recovery Card фича. Сервер физически не может держать свежий HRV/resting
HR/sleep в фоне.

**Следствие**: health-source целям нельзя посчитать progress фоново (когда юзер не
в приложении). Рекомендация — считать их **на клиенте**, а не через универсальный
серверный калькулятор:

- `MetaGoalCard`/`GoalDetailsScreen` для sub-goal с `source: 'health'` берут
  `current_value` из локального `useHealthData()`, а не из API-ответа — единственное
  осознанное исключение из "весь progress считает сервер".
- Сервер для `health`-source просто возвращает последний известный `current_value`
  как есть (не пересчитывает), как и для `coach`-source.

### 2.2 Имена `health_metric` не совпадают с полями `HealthContext`

Спек: `hrv | resting_hr | sleep_hours | weight`.
Реальные поля (`healthService.ts`): `hrv_ms`, `resting_hr_bpm`, `sleep_hours`,
`weight_kg`. Нужна явная map при реализации:

```typescript
const HEALTH_METRIC_FIELD: Record<string, keyof HealthContext> = {
  hrv: 'hrv_ms',
  resting_hr: 'resting_hr_bpm',
  sleep_hours: 'sleep_hours',
  weight: 'weight_kg',
};
```

### 2.3 `linkedSessions` не должен потеряться при переписывании `get_goals_progress`

Текущая реализация (`aiCoach.js:878-928`) уже считает `linkedSessions` (calendar
events: total/completed/upcoming) на мета-цель. Спек §6.3 переписывает функцию с
нуля под pace/lifecycle-флаги и это поле не переносит — при рефакторинге сохранить.

### 2.4 Миграция — тем же паттерном, что уже используется в проекте

В спеке миграция дана как one-off SQL script с backfill UPDATE. В проекте нет
отдельного механизма миграций — все `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
накопительно живут в коде и выполняются при старте сервера (так добавлялись
`tier`/`focus_tags` на `meta_goals`). Держим тот же паттерн для
`source`/`metric`/`start_date`/`end_date` на `goals`, без отдельного скрипта.

### 2.5 Legacy-кейсы, которые backfill не покрывает — и не должен

`avg_hr_flat`/`avg_hr_hills` (физическая модель скорости на подъём/равнину) и
`intervals` (сервер сознательно всегда возвращает 0 — "умышленно не считаются
автоматически", комментарий в коде) не входят в backfill-скрипт спека. Это верно —
они остаются на `calculateLegacyProgress` fallback, который спек и предусматривает;
никаких новых полей под них не нужно.

---

## 3. Явно ВНЕ скоупа (вырезано из ресёрча Opus)

Всё это технически описано в `GOALS_SYSTEM_REDESIGN.md`, но не нужно сейчас —
можно вернуться отдельным заходом, если возникнет реальный запрос:

- **Периодизация** — build/peak/taper фазы, авто-планирование недели через
  `plan_training_week` (Opus Phase 5). Коуч и так может насоздавать календарных
  событий вручную через диалог — отдельного движка периодизации не строим.
- **Библиотека шаблонов целей** — `suggest_goal_templates` tool + рич-карточка с
  подсказками (Opus Phase 6).
- **Прогрессия тиров, разблокировки, XP, лидерборды** — геймификация, прямо
  исключена по запросу.

Авто-комплит **не исключён** — см. §4, Фаза 1: он в основном скоупе, порог понижен
до 98%, срабатывает через коуча в диалоге, а не молча в БД (см. ниже почему).

---

## 4. Порядок реализации (3 фазы = 3 названные проблемы)

### Фаза 1 — Декларативные метрики + гибкие даты (backend, ~3 дня)

- `server.js`: `ALTER TABLE goals ADD COLUMN IF NOT EXISTS source/metric/start_date/end_date` (idempotent, при старте).
- Новый файл `server/goalCalculator.js` — universal calculator (спек §2.1), БЕЗ
  health-кейса на сервере (см. §2.1 выше — health отдаёт `current_value` as-is).
- `aiCoach.js`: `get_goals_progress` — заменить вызов legacy switch на
  `goalCalculator`, сохранить `linkedSessions` (§2.3), добавить pace (спек §2.3) и
  lifecycle-флаги (`readyToComplete`, `expired`, `overachieving`).
- `update_goal` — расширить под `sub_goal_id`/`current_value`/`new_target_value`/
  `new_end_date` (спек §6.2), чтобы coach-source цели реально могли двигаться.

**Авто-комплит (порог 98%, не 100%)**: reaching exactly 100% редко случается ровно —
райдер, целившийся в 400км, реально финиширует на 393км (98.25%) и по смыслу цель
достигнута. Порог в `readyToComplete` понижаем:

```javascript
// Было: g.current_value >= g.target_value (т.е. 100%)
// Стало:
const readyToComplete = subGoals.every(g => g.current_value >= g.target_value * 0.98)
  && metaGoal.status === 'active';
```

Важно: это НЕ автоматический флип `status: 'completed'` в БД без участия
пользователя — той же логике, что уже установлена во всей коуч-фиче в этом чате
(suggest_connect_apple_health, analyze_readiness): коуч ВИДИТ флаг
`readyToComplete` в результате инструмента и сам поднимает тему в диалоге
("Похоже, ты выполнил цель на 98%+ — закрыть её как выполненную?"), закрытие
происходит через `update_goal({status: 'completed'})` только если пользователь
согласился. Добавить в системный промпт `aiCoach.js`:

```
## Goal Lifecycle
When get_goals_progress returns readyToComplete: true for a goal, mention it and
ask if they want to mark it complete — don't just announce it as already done.
```

### Фаза 2 — AI generation prompt rewrite (~1 день)

- `aiGoals.js`: убрать фиксированный список `goal_type`/`period` из промпта,
  добавить описание 4 источников метрики (спек §3.1) с примерами, добавить
  `existingGoals` контекст (уже частично есть soft-dup через `focus_tags` — расширить
  под конкретные метрики, чтобы не плодить дубли по смыслу).
- Server-side validation декларативной метрики перед INSERT (спек §3.3).

### Фаза 3 — Frontend + депрекейт библиотеки тренировок (~2 дня)

- `goalsCache.ts`: убрать `calculateGoalProgress` для `activity`/`skills`-source
  (сервер считает и отдаёт), **оставить** client-side расчёт для `health`-source
  (§2.1).
- `MetaGoalCard.tsx`, `GoalDetailsScreen.tsx`: динамические label/unit из самой цели
  вместо хардкод-мапы, pace-индикатор (ahead/behind/on track), health-source читает
  `useHealthData()` напрямую.
- `GoalDetailsScreen.tsx` Trainings tab: legacy-цели показывают старые
  `trainingTypes` как есть; новые цели — кнопка "Спросить коуча про план" →
  `CoachChatScreen` с заготовленным промптом (спек §4.2, Phase 1 только — без Phase 2
  удаления таба целиком, чтобы не потерять legacy-контент).

**Итого**: ~6 дней, без Opus-специфичных фаз 5-7 (периодизация/шаблоны/дубликаты) и
без какой-либо геймификации.

---

## 5. Затронутые файлы

| Файл | Что меняем |
|---|---|
| `server/server.js` | ALTER TABLE (source/metric/start_date/end_date), обновить `/api/meta-goals`, `/api/meta-goals/:id` под новый calculator |
| `server/goalCalculator.js` (новый) | Universal declarative calculator — activity/skills/coach только, health отдаёт as-is |
| `server/aiCoach.js` | `get_goals_progress` — calculator + pace + lifecycle-флаги + сохранить `linkedSessions`; `update_goal` — новые поля |
| `server/aiGoals.js` | Промпт: 4 источника метрики вместо enum, произвольные даты, existingGoals контекст, убрать training-types секцию |
| `BikeLabApp/src/utils/goalsCache.ts` | Убрать calculateGoalProgress для activity/skills, оставить для health, обновить интерфейсы |
| `BikeLabApp/src/utils/healthService.ts` | Добавить `HEALTH_METRIC_FIELD` маппинг (§2.2) |
| `BikeLabApp/src/components/MetaGoalCard.tsx` | Pace-индикатор, health-source из useHealthData() |
| `BikeLabApp/src/screens/GoalDetailsScreen.tsx` | Динамические label/unit, pace badge, Trainings tab → "Спросить коуча" CTA для новых целей |
