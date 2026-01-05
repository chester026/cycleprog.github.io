# 🎯 Rider Profile Feature

## Что это?

**Автоматическое определение профиля велосипедиста** на основе анализа навыков (Skills Radar Chart).

## Где отображается?

На странице **Analysis** → внутри **Skills Radar Chart** → в самом верху легенды (над списком навыков).

## Как это работает?

### 1. Вычисление навыков
Система анализирует последние 3 месяца активностей и вычисляет 6 навыков:
- Climbing
- Sprint/Attack
- Endurance
- Tempo
- Power
- Discipline

### 2. Определение профиля
На основе этих навыков алгоритм определяет профиль:

```javascript
// Функция: determineRiderProfile(skills)
// Расположение: react-spa/src/utils/skillsCalculator.js

1. Если среднее < 40 → Developing Rider 🎯
2. Если все навыки сбалансированы → All-Rounder 🚴
3. Если Discipline выделяется → Consistent Trainer 📊
4. Если Tempo + Power высокие → Time Trialist ⏱️
5. Если один навык доминирует → профиль по этому навыку
6. Если топ-2: Climbing+Endurance → Mountain Endurance 🏔️
7. Если топ-2: Sprint+Power → Explosive Sprinter 💥
8. По умолчанию → Versatile Rider 🚴
```

### 3. Отображение в UI
```jsx
<div className="rider-profile-badge">
  <div className="profile-text">
    <span className="profile-name">Climber</span>
    <span className="profile-description">Mountains are your playground</span>
  </div>
  <div className="profile-score">
    <span className="score-value">{overallScore}</span>
    <span className="score-label">Overall</span>
  </div>
</div>
```

**Overall Score** - средний балл по всем навыкам (0-100), показывает общий уровень райдера.

## 📊 Все профили

| Профиль | Emoji | Описание |
|---------|-------|----------|
| Climber | 🏔️ | Mountains are your playground |
| Sprinter | ⚡ | Explosive power on demand |
| Endurance Rider | 💪 | Built for long distances |
| Time Trialist | ⏱️ | Speed and power combined |
| All-Rounder | 🚴 | Balanced across all areas |
| Consistent Trainer | 📊 | Discipline is your strength |
| Tempo Specialist | 🎯 | Sustained speed master |
| Power House | ⚡ | Watts for days |
| Mountain Endurance | 🏔️ | Long climbs specialist |
| Explosive Sprinter | 💥 | Pure acceleration |
| Versatile Rider | 🚴 | Growing in all areas |
| Developing Rider | 🎯 | Keep training, results will come! |

## Файлы

### Frontend:
- **Логика:** `react-spa/src/utils/skillsCalculator.js`
  - Функция: `determineRiderProfile(skills)`
- **Компонент:** `react-spa/src/components/SkillsRadarChart.jsx`
  - Вычисление: `const riderProfile = useMemo(...)`
  - Рендер: `<div className="rider-profile-badge">...</div>`
- **Стили:** `react-spa/src/components/SkillsRadarChart.css`
  - `.rider-profile-badge`
  - `.profile-emoji`
  - `.profile-name`
  - `.profile-description`

### Документация:
- **Детали:** `md/SKILLS_RADAR_CHART.md`
- **Краткое руководство:** `md/RIDER_PROFILE_FEATURE.md` (этот файл)

## Как это выглядит?

```
┌──────────────────────────────────────────────────┐
│ Skills                                           │
│ Based on last 3 months of activities            │
├──────────────────────────────────────────────────┤
│                                                  │
│  [Radar Chart]      ┌────────────────────────┐  │
│                     │ Climber           [62] │  │
│                     │ Mountains are your     │  │
│                     │ playground     Overall │  │
│                     ├────────────────────────┤  │
│                     │ Climbing: 67 +2⬆️      │  │
│                     │ Sprint: 45             │  │
│                     │ Endurance: 58          │  │
│                     │ Tempo: 60              │  │
│                     │ Power: 55              │  │
│                     │ Discipline: 68         │  │
│                     └────────────────────────┘  │
└──────────────────────────────────────────────────┘

Overall Score: (67+45+58+60+55+68) / 6 = 62
```

## UI Details

### Desktop:
- **Название:** 20px, жирный, белый
- **Описание:** 13px, серый (rgba 0.7)
- **Overall Score:**
  - Значение: 28px, жирный, оранжевый `rgb(255, 94, 0)`
  - Label: 11px, uppercase, серый
  - Фон: `rgba(255, 94, 0, 0.1)`
  - Рамка: `rgba(255, 94, 0, 0.3)`
  - Padding: 8px 16px
- **Badge фон:** `#191b21`
- **Badge рамка:** `rgb(82 82 82 / 30%)`
- **Hover:** свечение `0 4px 12px rgba(255,94,0,0.15)`

### Mobile:
- **Название:** 18px
- **Описание:** 12px
- **Overall Score:**
  - Значение: 24px
  - Label: 10px
  - Padding: 6px 12px
- **Padding badge:** 12px (вместо 10px)

## Адаптивность профиля

Профиль **динамически меняется** при изменении навыков:
- Если улучшишь Climbing → можешь стать Climber
- Если сбалансируешь все навыки → станешь All-Rounder
- Если начнешь тренироваться регулярно → можешь получить Consistent Trainer

**Мотивирующий элемент!** 💪

---

## 📊 Overall Score (Общий балл)

### Как вычисляется:
```javascript
// В SkillsRadarChart.jsx
const overallScore = useMemo(() => {
  if (!skillsData || skillsData.length === 0) return 0;
  
  const sum = skillsData.reduce((acc, skill) => acc + skill.value, 0);
  return Math.round(sum / skillsData.length);
}, [skillsData]);
```

**Формула:**
```
Overall Score = (Climbing + Sprint + Endurance + Tempo + Power + Discipline) / 6
```

**Примеры:**
- Climbing: 67, Sprint: 45, Endurance: 58, Tempo: 60, Power: 55, Discipline: 68
- **Overall: (67+45+58+60+55+68) / 6 = 59 (округлено)**

### Интерпретация:
- **0-30** 🔴 Beginner - начинающий уровень
- **30-50** 🟡 Intermediate - средний уровень
- **50-70** 🟢 Advanced - продвинутый уровень
- **70-85** 🔵 Expert - экспертный уровень
- **85-100** 🟣 Elite - элитный уровень

### Зачем нужен:
1. **Быстрая оценка** - одно число вместо 6
2. **Отслеживание прогресса** - легко увидеть общий рост
3. **Сравнение** - понять свой уровень
4. **Мотивация** - цель "достичь 70+"

### Связь с профилем:
- **Developing Rider** (<40) → Overall обычно <40
- **All-Rounder** (balanced) → Overall обычно 55+
- **Специализированные профили** → Overall может быть средним, но один навык >80

**Overall Score показывает общую подготовку, профиль показывает специализацию!**

