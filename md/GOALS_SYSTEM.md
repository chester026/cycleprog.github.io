# Система целей (Goals System)

## Обзор

Система целей позволяет пользователям устанавливать и отслеживать прогресс по различным тренировочным показателям. Система автоматически рассчитывает прогресс на основе данных из Strava и предоставляет визуализацию достижений.

## Архитектура

### Основные компоненты

```
📁 react-spa/src/
├── 🎯 components/GoalsManager.jsx     # Управление целями (UI)
├── 🧮 utils/goalsCache.js            # Кэширование и расчет целей
├── ⚙️ utils/cacheCheckup.js          # Система чек-апа кэша
├── 📊 utils/cacheConstants.js        # Константы TTL
└── 📈 utils/vo2max.js                # Расчет FTP/VO2max
```

### База данных

```sql
-- Таблица целей
CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_value DECIMAL(10,2) NOT NULL,
  current_value DECIMAL(10,2) DEFAULT 0,
  unit VARCHAR(50),
  goal_type VARCHAR(50) NOT NULL,
  period VARCHAR(20) DEFAULT '4w',
  hr_threshold INTEGER DEFAULT 160,
  duration_threshold INTEGER DEFAULT 120,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Система кэширования

### Принципы работы

1. **Автоматический чек-ап** при загрузке PlanPage
2. **Кэширование результатов** на 7 дней
3. **Пересчет при новых тренировках**
4. **Оптимизация производительности**

### Времена кэширования (TTL)

| **Тип данных** | **TTL** | **Очистка** | **Логика** |
|---|---|---|---|
| **Streams** | 7 дней | 10 дней | Редко меняются |
| **Цели** | 7 дней | 10 дней | Зависят от streams |
| **Активности** | 30 минут | 1 час | Могут обновляться |

### Кэш ключи

```javascript
// Цели
goals_progress_${activitiesHash}

// Streams данные
streams_${activityId}

// Активности
cycleprog_cache_activities_${userId}
```

## Типы целей

### Поддерживаемые типы

1. **distance** - Общая дистанция (км)
2. **elevation** - Набор высоты (м)
3. **time** - Время в движении (часы)
4. **speed_flat** - Средняя скорость на равнине (км/ч)
5. **speed_hills** - Средняя скорость в горах (км/ч)
6. **pulse** - Средний пульс (уд/мин)
7. **avg_hr_flat** - Средний пульс на равнине (уд/мин)
8. **avg_hr_hills** - Средний пульс в горах (уд/мин)
9. **avg_power** - Средняя мощность (Вт)
10. **ftp_vo2max** - FTP/VO2max тренировки (минуты)
11. **long_rides** - Количество длинных поездок
12. **intervals** - Количество интервальных тренировок
13. **recovery** - Количество восстановительных поездок
14. **custom** - Пользовательская цель

### Периоды

- **4w** - 4 недели
- **3m** - 3 месяца
- **year** - Год
- **all** - Все время

## Система чек-апа

### Автоматический чек-ап

```javascript
// При загрузке PlanPage
await cacheCheckup.performFullCheckup();
const recommendations = cacheCheckup.getOptimizationRecommendations();

// Автоматическое выполнение высокоприоритетных оптимизаций
const highPriorityRecs = recommendations.filter(rec => rec.priority === 'high');
if (highPriorityRecs.length > 0) {
  await cacheCheckup.executeRecommendations();
}
```

### Ручное управление

Доступно в админке: **AdminPage → Cache**

- Проверка статуса кэша
- Рекомендации по оптимизации
- Ручное выполнение оптимизаций
- Мониторинг размера кэша

## API Endpoints

### Получение целей
```http
GET /api/goals
```

### Создание цели
```http
POST /api/goals
Content-Type: application/json

{
  "title": "Пробежать 100 км",
  "description": "Пробежать 100 км за месяц",
  "target_value": 100,
  "unit": "km",
  "goal_type": "distance",
  "period": "4w"
}
```

### Обновление цели
```http
PUT /api/goals/:id
Content-Type: application/json

{
  "current_value": 75.5
}
```

### Удаление цели
```http
DELETE /api/goals/:id
```

## Расчет прогресса

### Общая логика

```javascript
// 1. Фильтрация активностей по периоду
const filteredActivities = activities.filter(a => {
  const activityDate = new Date(a.start_date);
  const periodStart = getPeriodStartDate(goal.period);
  return activityDate > periodStart;
});

// 2. Расчет в зависимости от типа цели
const progress = calculateGoalProgress(goal, filteredActivities);

// 3. Кэширование результата
cacheGoals(activities, updatedGoals);
```

### Специальные расчеты

#### FTP/VO2max тренировки
```javascript
// Анализ времени в высокоинтенсивных зонах
const { totalTimeMin } = analyzeHighIntensityTime(activities, periodDays, {
  hr_threshold: goal.hr_threshold || 160,
  duration_threshold: goal.duration_threshold || 120
});
```

#### Средняя мощность
```javascript
// Расчет на основе физических формул
const power = calculatePower(activity, {
  riderWeight: 75,
  bikeWeight: 8,
  airDensity: calculateAirDensity(temperature, elevation)
});
```

## Производительность

### Оптимизации

1. **Кэширование результатов** - избегаем повторных расчетов
2. **Хеширование активностей** - определяем изменения
3. **Ленивая загрузка streams** - только при необходимости
4. **Автоматическая очистка** - удаление устаревших данных

### Мониторинг

```javascript
// Размер кэша
const cacheSize = getCacheSize(); // MB

// Статистика использования
const stats = {
  activities: getActivitiesCacheStats(),
  streams: getStreamsCacheStats(),
  goals: getGoalsCacheStats()
};
```

## Безопасность

### Валидация данных

```javascript
// Проверка входных данных
const validateGoal = (goal) => {
  if (!goal.title || goal.title.length > 255) {
    throw new Error('Invalid title');
  }
  if (goal.target_value <= 0) {
    throw new Error('Target value must be positive');
  }
  // ... другие проверки
};
```

### Права доступа

- Пользователи могут управлять только своими целями
- Администраторы имеют доступ к системной информации
- API endpoints защищены аутентификацией

## Мониторинг и отладка

### Логирование

```javascript
console.log('🔍 Начинаем чек-ап кэша...');
console.log('📊 Активности:', activitiesResult.message);
console.log('📈 Streams:', streamsResult.message);
console.log('🎯 Цели:', goalsResult.message);
console.log('💾 Размер:', sizeResult.message);
```

### Обработка ошибок

```javascript
try {
  const progress = await calculateGoalProgress(goal, activities);
  return progress;
} catch (error) {
  console.error('Error calculating goal progress:', error);
  return 0; // Fallback значение
}
```

## Будущие улучшения

1. **Машинное обучение** - предсказание достижимости целей
2. **Социальные функции** - сравнение с друзьями
3. **Уведомления** - напоминания о прогрессе
4. **Экспорт данных** - выгрузка статистики
5. **Интеграция с календарем** - планирование тренировок 