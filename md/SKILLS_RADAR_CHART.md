# Skills Radar Chart & Snapshots

## Overview

Система профилирования велосипедиста: расчет 6 навыков из данных Strava, автоматическое сохранение снимков при появлении новых тренировок, вычисление трендов.

**Платформа:** React Native (BikeLabApp)  
**Период анализа:** последние 90 дней (для Climbing, Sprint, Endurance, Tempo, Power), 8 недель (для Discipline)

---

## Архитектура

```
AnalysisScreen opens
  → SkillsRadarChart вычисляет навыки → onSkillsCalculated(skills)
  → PowerAnalysis вычисляет мощность → onStatsCalculated(powerStats)
  → manageSkillsHistory():
      1. GET /api/skills-history/last  (последний снимок)
      2. Сравнить last_activity_id с текущей activities[0].id
      3. Если ID разные → POST /api/skills-history (сохранить)
      4. GET /api/skills-history/range?limit=2 (для трендов)
      5. trends = latest - previous → setSkillsTrend()
```

---

## Механизм снимков (Snapshots)

### Триггер: useEffect в AnalysisScreen

```
dependencies: [userProfile, currentSkills, summary]
```

Функция `manageSkillsHistory()` вызывается каждый раз, когда обновляются эти три значения. Внутри — guard:

```typescript
if (!userProfile?.id || !currentSkills || !summary) return; // ждем данные
```

Это значит: снимок НЕ будет сохранен, пока не вычислены все навыки и не загружен профиль пользователя.

### Шаг 1: Решение о сохранении

```
GET /api/skills-history/last → lastSnapshot (или null если первый раз)
```

**Вариант A — нет снимков:**  
`shouldSave = true` — сохраняем первый снимок безусловно.

**Вариант B — есть снимок:**  
Сравниваем `lastSnapshot.last_activity_id` с `activities[0].id`:
- ID разные → есть новая тренировка → `shouldSave = true`
- ID одинаковые → ничего не изменилось → пропускаем

Это значит: если пользователь открывает AnalysisScreen 5 раз подряд без новых тренировок — ничего не сохраняется.

### Шаг 2: Сохранение (если shouldSave = true)

```
POST /api/skills-history
Body: { user_id, last_activity_id, climbing, sprint, endurance, tempo, power, consistency }
```

**Power fix перед сохранением:** если `currentSkills.power === 0` но `lastSnapshot.power > 0` — берем `lastSnapshot.power`. Причина: PowerAnalysis может не успеть вычислить мощность до момента сохранения, и вместо реального `0` это просто отсутствие данных в этой сессии.

**Backend при POST:**
1. `INSERT ... ON CONFLICT (user_id, snapshot_date) DO UPDATE` — если уже есть снимок за сегодня, перезаписывает
2. `DELETE` — удаляет все снимки этого юзера кроме 2 последних по `created_at DESC`

Итого в БД всегда максимум **2 записи на пользователя**: текущий + предыдущий.

### Шаг 3: Вычисление трендов

```
GET /api/skills-history/range?limit=2 → [latest, previous]
```

Если есть 2 снимка:
```typescript
trends = {
  climbing: round(latest.climbing) - round(previous.climbing),
  sprint:   round(latest.sprint)   - round(previous.sprint),
  // ...аналогично для всех 6 навыков
}
setSkillsTrend(trends);
```

Тренды отображаются в UI:
- `+N` зеленый бейдж — навык вырос с прошлого снимка
- `-N` красный бейдж — навык упал
- Без бейджа — без изменений (trend === 0)

Если снимок только один — тренды не показываются.

### Пример жизненного цикла

```
День 1: Первый визит, 15 тренировок в Strava
  → currentSkills рассчитаны
  → GET /last → 404 (нет снимков)
  → POST: сохраняем snapshot #1 (last_activity_id = "abc123")
  → GET /range?limit=2 → [#1] — только 1 снимок, тренды не показываем

День 3: Новая тренировка в Strava (activity "def456")
  → GET /last → snapshot #1 (last_activity_id = "abc123")
  → "abc123" ≠ "def456" → shouldSave = true
  → POST: сохраняем snapshot #2 (last_activity_id = "def456")
  → Backend: delete old, keep last 2 → [#2, #1]
  → GET /range?limit=2 → [#2, #1]
  → trends = #2 - #1 → показываем "+3 climbing", "-1 sprint" и т.д.

День 3 (повторный визит): Открываем AnalysisScreen снова
  → GET /last → snapshot #2 (last_activity_id = "def456")
  → activities[0].id = "def456" (та же тренировка)
  → ID совпадают → shouldSave = false → ничего не делаем
  → GET /range?limit=2 → [#2, #1] → тренды показываем как раньше
```

### Confidence correction

При малом количестве тренировок за 90 дней навыки завышены из-за выбросов. Применяется коэффициент:
```
confidenceFactor = min(1, sqrt(activitiesCount / 20))
```
- 3 тренировки → factor 0.39, навык 70 → показываем 27
- 10 тренировок → factor 0.71, навык 70 → показываем 50
- 20+ тренировок → factor 1.0, навык 70 → показываем 70

**Discipline не корректируется** — он уже основан на частоте и стабильности, а не на абсолютных метриках отдельных заездов.

---

## Навыки и формулы расчета

### 1. Climbing (65% Density + 15-25% VAM + 10-20% VAM@HR)

**Порог учета:** elevation > 100м

**Climbing Density (65%)** — набор высоты на 100 км:
| м/100км | Баллы |
|---------|-------|
| < 200 | 0–20 |
| 200–500 | 20–40 |
| 500–1000 | 40–60 |
| 1000–1500 | 60–75 |
| 1500–2000 | 75–90 |
| 2000–3000+ | 90–100 |

**Median VAM** — для горных заездов (elevation > 350м AND elevationPerKm > 15):
| м/ч | Баллы |
|-----|-------|
| < 150 | 0 |
| 150–200 | 0–20 |
| 200–300 | 20–40 |
| 300–450 | 40–55 |
| 450–600 | 55–65 |
| 600–800 | 65–80 |
| 800–1200+ | 80–100 |

**VAM at HR 85–95% LTHR** — та же шкала, но для заездов с темповым пульсом.

Адаптивные веса: если заездов с HR данными < 3, вес VAM@HR снижается с 20% до 10%, а обычный VAM получает 25% вместо 15%.

Если нет горных заездов для VAM — используется densityScore как fallback.

---

### 2. Sprint/Attack (60% Max Speed + 40% Variability Index)

**Фильтр:** равнина (elevation < 10м/км), distance > 10км, avg_speed >= 22 км/ч

**Медианная Max Speed на равнине (60%):**
| км/ч | Баллы |
|------|-------|
| < 30 | 0 |
| 30–40 | 0–20 |
| 40–45 | 20–35 |
| 45–50 | 35–60 |
| 50–55 | 60–80 |
| 55–65+ | 80–100 |

**Медианный Variability Index (40%):**  
`VI = (max_speed - avg_speed) / avg_speed`

| VI | Баллы |
|----|-------|
| < 0.10 | 0 |
| 0.10–0.20 | 0–20 |
| 0.20–0.30 | 20–40 |
| 0.30–0.45 | 40–70 |
| 0.45–0.60 | 70–90 |
| 0.60–0.80+ | 90–100 |

---

### 3. Endurance (70% Volume + 30% VO2max)

**Volume** — средний недельный километраж (totalDistance / 12 weeks):
| км/нед | Баллы (из 70) |
|--------|---------------|
| < 20 | 0 |
| 20–50 | 5–15 |
| 50–80 | 15–25 |
| 80–120 | 25–40 |
| 120–250 | 40–55 |
| 250–350 | 55–65 |
| 350–500+ | 65–70 |

**VO2max** (из summary):
| ml/kg/min | Баллы (из 30) |
|-----------|---------------|
| < 20 | 0 |
| 20–30 | 0–5 |
| 30–40 | 5–10 |
| 40–50 | 10–15 |
| 50–75 | 15–25 |
| 75–85+ | 25–30 |

---

### 4. Tempo (50% Speed + 50% Efficiency)

**Фильтр:** равнина (elevation < 10м/км), distance > 20км

**Медианная скорость (50%):**
| км/ч | Баллы |
|------|-------|
| < 12 | 0 |
| 12–15 | 5–15 |
| 15–18 | 15–25 |
| 18–22 | 25–40 |
| 22–25 | 40–55 |
| 25–28 | 55–70 |
| 28–32 | 70–85 |
| 32–36 | 85–95 |
| 36–40+ | 95–100 |

**Медианная эффективность Speed/HR (50%)** — для заездов с HR 130–160 bpm:  
`efficiency = avg_speed_kmh / avg_heartrate`

| Ratio | Баллы |
|-------|-------|
| < 0.10 | 0 |
| 0.10–0.13 | 0–20 |
| 0.13–0.15 | 20–40 |
| 0.15–0.18 | 40–60 |
| 0.18–0.21 | 60–80 |
| 0.21–0.25 | 80–95 |
| 0.25+ | 95–100 |

Если нет заездов с HR в диапазоне — efficiency = speedScore (fallback).

---

### 5. Power

Берется `powerStats.avgPower` из PowerAnalysis (физическая модель: вес, аэро, погода, градиент).

| Watts | Баллы |
|-------|-------|
| < 60 | 0 |
| 60–80 | 0–15 |
| 80–100 | 15–30 |
| 100–120 | 30–40 |
| 120–200 | 40–60 |
| 200–280 | 60–80 |
| 280–340 | 80–95 |
| 340–450+ | 95–100 |

---

### 6. Discipline (Coverage + Stability → нормализация до 100)

**Период:** последние 8 недель (56 дней от текущей даты).  
**Входные данные:** ВСЕ активности (не только за 90 дней), фильтруются по дате внутри функции.  
**Confidence correction:** НЕ применяется — этот навык уже сам по себе отражает частоту.

#### Подготовка данных

1. Берем все активности за последние 8 недель
2. Группируем по неделям: `weekNumber = floor((activityDate - eightWeeksAgo) / 7 дней)`
3. Для каждой недели считаем: `count` (тренировок) и `totalDistance` (км)
4. Заполняем пустые недели нулями (если на неделе 0 тренировок)
5. Помечаем текущую неделю (`isCurrentWeek = true`)

#### Часть 1: Coverage (0–40 баллов)

Оценивает регулярность посещения тренировок. Оцениваются только **завершённые недели** (7 из 8), текущая неделя — отдельно.

**Классификация недель:**
```
weeksWithZero — завершенные недели с 0 тренировок
weeksWithOne  — завершенные недели с ровно 1 тренировкой
weeksWithMin2 — завершенные недели с 2+ тренировками
weeksWithMin3 — завершенные недели с 3+ тренировками
```

**Grace period:** первая неделя с 0 тренировок НЕ штрафуется (отпуск/восстановление допустимо):
```
effectiveWeeksWithZero = max(0, weeksWithZero - 1)
```

**Подсчёт:**
```
coverageScore  = 0
coverageScore -= effectiveWeeksWithZero * 5    // штраф за каждый пропуск (кроме grace)
coverageScore += weeksWithOne * 2.5            // неделя с 1 тренировкой — полбалла от нормы
coverageScore += weeksWithMin2 * 5             // неделя с 2+ — полный балл
coverageScore += weeksWithMin3 * 0.5           // бонус за 3+ тренировки на неделе
coverageScore = clamp(0, 40)
```

**Бонус за текущую неделю** (она ещё не закончилась, поэтому не штрафуем, но поощряем):
```
if currentWeek.count >= 3:
  coverageScore += min(5, count * 1.5)   // 3 тренировки → +4.5, 4 → +5 (cap)
else if currentWeek.count >= 1:
  coverageScore += min(2, count * 0.5)   // 1 → +0.5, 2 → +1
coverageScore = clamp(0, 40)
```

**Примеры:**

| Сценарий | Расчет | Coverage |
|----------|--------|----------|
| 7 недель по 3+ трен., текущая: 2 | 7×5 + 7×0.5 + 1 = 39.5 → cap 40 | **40** |
| 7 недель по 2 трен., текущая: 0 | 7×5 = 35 | **35** |
| 5 недель по 2, 1 неделя по 1, 1 пропуск, текущая: 1 | grace(1 нулевая) + 5×5 + 1×2.5 + 0.5 = 28 | **28** |
| 4 недели по 2, 3 пропуска, текущая: 0 | effectiveZero=2, −2×5 + 4×5 = 10 | **10** |
| Все 7 недель пустые, текущая: 0 | effectiveZero=6, −6×5 = −30 → cap 0 | **0** |

#### Часть 2: Stability (0–30 баллов)

Оценивает стабильность объёма (km/week) — не count, а именно расстояние.

**Считается только по завершённым неделям.** Текущая неделя исключена.

**Условие:** если средний недельный объём < 30 км — stability = 0 (недостаточно данных).

**Алгоритм:**
```
weeklyDistances = completedWeeks.map(w => w.totalDistance)   // км
avgWeeklyDistance = mean(weeklyDistances)

if avgWeeklyDistance < 30:
  stabilityScore = 0
else:
  variance = mean((d - avg)^2 for each d)
  stdDev = sqrt(variance)
  cv = min(1, stdDev / avgWeeklyDistance)    // Coefficient of Variation, capped at 1
  stabilityScore = 30 * (1 - cv)^1.5         // нелинейная шкала
```

**Почему нелинейная (степень 1.5):**
- Вознаграждает высокую стабильность непропорционально сильнее
- CV = 0 (идеал) → 30 баллов
- CV = 0.2 → 23 балла (почти максимум за хорошую стабильность)
- CV = 0.5 → 11 баллов (средняя стабильность)
- CV = 0.8 → 3 балла (почти хаос)
- CV = 1.0 → 0 баллов

**Примеры:**

| Недельные дистанции (км) | avg | stdDev | CV | Stability |
|--------------------------|-----|--------|-----|-----------|
| 50, 55, 48, 52, 50, 53, 49 | 51 | 2.4 | 0.047 | **29** |
| 80, 60, 100, 70, 90, 50, 110 | 80 | 20.7 | 0.259 | **19** |
| 120, 30, 150, 10, 100, 0, 80 | 70 | 53.5 | 0.764 | **2** |
| 20, 25, 15, 22, 18, 28, 20 | 21 | 4.1 | — | **0** (avg < 30) |

#### Итоговый балл Discipline

```
totalRaw = coverageScore + stabilityScore   // диапазон 0–70
finalScore = (totalRaw / 70) * 100          // нормализация до 0–100
return clamp(0, 100, finalScore)
```

**Полный пример:**
- Coverage: 35 (регулярные тренировки, одна неделя с 1 заездом)
- Stability: 23 (стабильный объём с небольшими колебаниями)
- Raw: 58/70 → **finalScore = 83**

**Крайние случаи:**
- Идеальный тренер: 40 + 30 = 70/70 → **100**
- Тренируется но хаотично: 30 + 5 = 35/70 → **50**
- Редкие тренировки: 10 + 0 = 10/70 → **14**
- Полное отсутствие: 0 + 0 = 0 → **0**

---

## Rider Profile

Определяется из рассчитанных навыков:

| # | Проверка | Профиль |
|---|----------|---------|
| 1 | avg < 40 | Developing Rider |
| 2 | max−min < 20 AND avg >= 55 | All-Rounder |
| 3 | consistency > 75 AND > avg+15 | Consistent Trainer |
| 4 | tempo >= 60 AND power >= 60 AND (tempo+power)/2 > avg+10 | Time Trialist |
| 5 | dominance > 10 по навыку | Climber / Sprinter / Endurance Rider / Tempo Specialist / Power House |
| 6 | top-2: climbing+endurance | Mountain Endurance |
| 7 | top-2: sprint+power | Explosive Sprinter |
| 8 | default | Versatile Rider |

---

## Backend API

**Route:** `server/routes/skillsHistory.js`  
**Base:** `/api/skills-history`  
**Auth:** JWT Bearer token

### Endpoints

| Method | Path | Описание |
|--------|------|----------|
| GET | `/last` | Последний снимок пользователя |
| GET | `/compare?date=YYYY-MM-DD` | Снимок на дату или ближайший ранее |
| POST | `/` | Сохранить снимок (хранит только 2 последних) |
| GET | `/range?limit=N` | Последние N снимков |
| DELETE | `/cleanup-month` | Удалить старые снимки за прошлый месяц (legacy) |

### POST body

```json
{
  "climbing": 67,
  "sprint": 45,
  "endurance": 72,
  "tempo": 58,
  "power": 54,
  "consistency": 81,
  "last_activity_id": 12345678
}
```

Валидация: все навыки обязательны, значения 0–100.

---

## Database

```sql
CREATE TABLE skills_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  climbing INTEGER CHECK (climbing >= 0 AND climbing <= 100),
  sprint INTEGER CHECK (sprint >= 0 AND sprint <= 100),
  endurance INTEGER CHECK (endurance >= 0 AND endurance <= 100),
  tempo INTEGER CHECK (tempo >= 0 AND tempo <= 100),
  power INTEGER CHECK (power >= 0 AND power <= 100),
  consistency INTEGER CHECK (consistency >= 0 AND consistency <= 100),
  last_activity_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_snapshot UNIQUE(user_id, snapshot_date)
);

CREATE INDEX idx_skills_history_user_date ON skills_history(user_id, snapshot_date DESC);
```

---

## Файлы

```
BikeLabApp/src/
  ├── utils/skillsCalculator.ts        — расчет 6 навыков + rider profile
  ├── screens/AnalysisScreen.tsx        — оркестрация: save/load/trends
  └── components/SkillsRadarChart.tsx   — визуализация (Recharts radar)

server/
  └── routes/skillsHistory.js           — API endpoints + retention (2 snapshots)
```
