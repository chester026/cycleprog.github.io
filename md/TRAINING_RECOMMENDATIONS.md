# Система тренировочных рекомендаций

## Обзор

Система тренировочных рекомендаций автоматически генерирует персонализированные планы тренировок на основе прогресса пользователя по целям. Система учитывает приоритеты целей, опыт пользователя, доступное время и сезонность.

## Архитектура

### Компоненты системы

1. **База знаний тренировок** (`training-types.json`)
2. **Маппинг целей** (`goal-mapping.json`)
3. **Утилиты генерации** (`training-utils.js`)
4. **API эндпоинты** для получения рекомендаций
5. **UI компонент** календаря тренировок

## База знаний

### Типы тренировок

#### 1. Выносливость (Endurance)
- **Интенсивность**: 60-75% FTP
- **Длительность**: 2-4 часа
- **Каденс**: 80-90 об/мин
- **Цели**: long_rides, elevation, recovery, avg_speed
- **Польза**: базовая выносливость, жировой обмен

#### 2. Темповые (Tempo)
- **Интенсивность**: 85-95% FTP
- **Длительность**: 20-60 минут
- **Каденс**: 85-95 об/мин
- **Цели**: speed_flat, avg_speed, avg_power, avg_hr_flat
- **Польза**: лактатный порог, мышечная выносливость

#### 3. Интервалы (Intervals)
- **Интенсивность**: 105-120% FTP
- **Длительность**: 3-8 минут
- **Каденс**: 90-100 об/мин
- **Цели**: ftp_vo2max, max_power, intervals, avg_hr_hills
- **Польза**: VO2max, анаэробная выносливость

#### 4. Sweet Spot
- **Интенсивность**: 88-93% FTP
- **Длительность**: 20-40 минут
- **Каденс**: 85-95 об/мин
- **Цели**: avg_power, ftp_vo2max, speed_flat, avg_speed
- **Польза**: эффективное повышение FTP

#### 5. Восстановление (Recovery)
- **Интенсивность**: 50-65% FTP
- **Длительность**: 30-60 минут
- **Каденс**: 70-80 об/мин
- **Цели**: recovery, avg_hr_flat, avg_hr_hills
- **Польза**: восстановление, кровообращение

#### 6. Подъемы (Hill Climbing)
- **Интенсивность**: 80-110% FTP
- **Длительность**: 5-20 минут
- **Каденс**: 60-80 об/мин
- **Цели**: speed_hills, elevation, avg_hr_hills, avg_power
- **Польза**: навыки езды в гору, сила ног

#### 7. Спринты (Sprint)
- **Интенсивность**: 130-150% FTP
- **Длительность**: 10-30 секунд
- **Каденс**: 100-120 об/мин
- **Цели**: max_power, intervals
- **Польза**: взрывная сила, координация

## Алгоритм генерации

### 1. Анализ прогресса целей

```javascript
function analyzeGoalProgress(goals) {
  return goals.map(goal => {
    const progress = (goal.current_value / goal.target_value) * 100;
    const weeksLeft = calculateWeeksLeft(goal.period);
    const priority = calculatePriority(progress, weeksLeft, goal.goal_type);
    
    return { goalType, progress, weeksLeft, priority };
  });
}
```

### 2. Определение приоритетов

```javascript
function calculatePriority(progress, weeksLeft, goalType) {
  const basePriority = goalMapping[goalType]?.priority_weight || 1.0;
  const progressFactor = (100 - progress) / 100;
  const timeFactor = 1 / weeksLeft;
  
  return basePriority * progressFactor * timeFactor;
}
```

### 3. Генерация недельного плана

```javascript
function generateWeeklyPlan(goals, userProfile) {
  const goalAnalysis = analyzeGoalProgress(goals);
  const trainingPriorities = determineTrainingPriorities(goalAnalysis);
  
  return {
    monday: generateTrainingDay(trainingPriorities, 'monday'),
    tuesday: generateTrainingDay(trainingPriorities, 'tuesday'),
    wednesday: generateTrainingDay(trainingPriorities, 'wednesday'),
    thursday: generateRestDay(),
    friday: generateTrainingDay(trainingPriorities, 'friday'),
    saturday: generateTrainingDay(trainingPriorities, 'saturday'),
    sunday: generateRestDay()
  };
}
```

## Персонализация

### Уровни опыта

#### Начинающий
- **Интенсивность**: -20%
- **Длительность**: -30%
- **Частота**: -20%
- **Рекомендуемые типы**: endurance, recovery, tempo

#### Средний
- **Интенсивность**: 100%
- **Длительность**: 100%
- **Частота**: 100%
- **Рекомендуемые типы**: все типы

#### Продвинутый
- **Интенсивность**: +10%
- **Длительность**: +20%
- **Частота**: +10%
- **Рекомендуемые типы**: все типы

### Сезонные адаптации

#### Зима
- **Фокус**: помещение
- **Интенсивность**: -10%
- **Рекомендуемые**: intervals, sweet_spot, tempo

#### Весна
- **Фокус**: улица
- **Интенсивность**: 100%
- **Рекомендуемые**: endurance, tempo, hill_climbing

#### Лето
- **Фокус**: улица
- **Интенсивность**: 100%
- **Рекомендуемые**: все типы

#### Осень
- **Фокус**: улица
- **Интенсивность**: -5%
- **Рекомендуемые**: endurance, recovery, tempo

## API эндпоинты

### Получение недельного плана

```http
GET /api/training-plan
Authorization: Bearer <token>
```

**Ответ:**
```json
{
  "plan": {
    "monday": {
      "type": "training",
      "trainingType": "tempo",
      "name": "Темповые",
      "description": "Устойчивые усилия для улучшения скорости",
      "recommendation": "Темповые: Устойчивые усилия для улучшения скорости",
      "details": {
        "intensity": "85-95% FTP",
        "duration": "20-60 минут",
        "cadence": "85-95 об/мин",
        "structure": {
          "warmup": "15 минут разминка",
          "main": "3x20 минут темпо",
          "cooldown": "10 минут заминка"
        }
      }
    }
  },
  "analysis": [
    {
      "goalType": "speed_flat",
      "progress": 65,
      "weeksLeft": 3,
      "priority": 1.8
    }
  ]
}
```

### Получение рекомендаций для цели

```http
GET /api/goals/{goalId}/recommendations
Authorization: Bearer <token>
```

## UI компонент

### Календарь тренировок

```jsx
const WeeklyTrainingCalendar = ({ goals, userProfile }) => {
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  
  useEffect(() => {
    const plan = generateWeeklyPlan(goals, userProfile);
    setWeeklyPlan(plan);
  }, [goals, userProfile]);
  
  return (
    <div className="weekly-calendar">
      <h3>Рекомендуемые тренировки на неделю</h3>
      <div className="calendar-grid">
        {Object.entries(weeklyPlan?.plan || {}).map(([day, plan]) => (
          <div key={day} className={`calendar-day ${plan.type}`}>
            <div className="day-header">
              <span className="day-name">{getDayName(day)}</span>
              <span className="day-type">{plan.type === 'rest' ? 'Отдых' : 'Тренировка'}</span>
            </div>
            <div className="day-content">
              <div className="recommendation">{plan.recommendation}</div>
              {plan.details && (
                <div className="workout-details">
                  <div>Интенсивность: {plan.details.intensity}</div>
                  <div>Длительность: {plan.details.duration}</div>
                  <div>Каденс: {plan.details.cadence}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Структура файлов

```
server/recommendations/
├── training-types.json      # База знаний тренировок
├── goal-mapping.json        # Маппинг целей на тренировки
├── training-utils.js        # Утилиты генерации
└── index.js                 # Основной модуль

react-spa/src/components/
└── WeeklyTrainingCalendar.jsx  # UI компонент календаря
```

## Преимущества системы

1. **Персонализация** - рекомендации под конкретного пользователя
2. **Динамичность** - план меняется на основе прогресса
3. **Научность** - основано на принципах спортивной физиологии
4. **Практичность** - конкретные тренировки, а не общие советы
5. **Адаптивность** - учитывает опыт, время, сезон

## Планы развития

1. **Интеграция с календарем** - экспорт в Google Calendar
2. **Уведомления** - напоминания о тренировках
3. **Отслеживание выполнения** - отметки выполненных тренировок
4. **Аналитика** - статистика выполнения планов
5. **Социальные функции** - обмен планами между пользователями 