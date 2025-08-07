# Расчеты целей (Goals Calculations)

## Обзор

Документ описывает алгоритмы расчета прогресса для различных типов целей в системе. Все расчеты выполняются на клиентской стороне с использованием кэшированных данных из Strava.

## Архитектура расчетов

### Основные принципы

1. **Кэширование результатов** - избегаем повторных расчетов
2. **Хеширование активностей** - определяем изменения
3. **Ленивая загрузка streams** - только при необходимости
4. **Единая утилита** - `goalsCache.js` для всех расчетов

### Поток данных

```
📊 Strava API → 🗄️ localStorage → 🧮 goalsCache.js → 🎯 GoalsManager
```

## Типы расчетов

### 1. Distance (Дистанция)

**Описание**: Общая дистанция за период  
**Единица**: км  
**Формула**: `Σ(distance) / 1000`

```javascript
case 'distance':
  return filteredActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
```

### 2. Elevation (Набор высоты)

**Описание**: Общий набор высоты  
**Единица**: метры  
**Формула**: `Σ(total_elevation_gain)`

```javascript
case 'elevation':
  return filteredActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
```

### 3. Time (Время)

**Описание**: Время в движении  
**Единица**: часы  
**Формула**: `Σ(moving_time) / 3600`

```javascript
case 'time':
  const totalMovingTime = filteredActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
  return totalMovingTime / 3600;
```

### 4. Speed Flat (Скорость на равнине)

**Описание**: Средняя скорость на равнинных участках  
**Единица**: км/ч  
**Фильтр**: `distance > 3000m` и `elevation < distance * 0.03`

```javascript
case 'speed_flat':
  const flatActivities = filteredActivities.filter(a => {
    const distance = a.distance || 0;
    const elevation = a.total_elevation_gain || 0;
    return distance > 3000 && elevation < distance * 0.03;
  });
  if (flatActivities.length === 0) return 0;
  const flatSpeeds = flatActivities.map(a => (a.average_speed || 0) * 3.6);
  return flatSpeeds.reduce((sum, speed) => sum + speed, 0) / flatSpeeds.length;
```

### 5. Speed Hills (Скорость в горах)

**Описание**: Средняя скорость на горных участках  
**Единица**: км/ч  
**Фильтр**: `distance > 3000m` и `elevation >= distance * 0.025`

```javascript
case 'speed_hills':
  const hillActivities = filteredActivities.filter(a => {
    const distance = a.distance || 0;
    const elevation = a.total_elevation_gain || 0;
    return distance > 3000 && elevation >= distance * 0.025;
  });
  if (hillActivities.length === 0) return 0;
  const hillSpeeds = hillActivities.map(a => (a.average_speed || 0) * 3.6);
  return hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;
```

### 6. Pulse (Средний пульс)

**Описание**: Средний пульс за период  
**Единица**: bpm  
**Формула**: `avg(average_heartrate)`

```javascript
case 'pulse':
  const pulseActivities = filteredActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
  if (pulseActivities.length === 0) return 0;
  const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
  return totalPulse / pulseActivities.length;
```

### 7. Avg HR Flat (Средний пульс на равнине)

**Описание**: Средний пульс на равнинных участках  
**Единица**: bpm  
**Фильтр**: Равнинные активности + пульс

```javascript
case 'avg_hr_flat':
  const flatPulseActivities = filteredActivities.filter(a => {
    const distance = a.distance || 0;
    const elevation = a.total_elevation_gain || 0;
    return distance > 3000 && elevation < distance * 0.03 && a.average_heartrate && a.average_heartrate > 0;
  });
  if (flatPulseActivities.length === 0) return 0;
  const flatAvgHR = flatPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / flatPulseActivities.length;
  return Math.round(flatAvgHR);
```

### 8. Avg HR Hills (Средний пульс в горах)

**Описание**: Средний пульс на горных участках  
**Единица**: bpm  
**Фильтр**: Горные активности + пульс

```javascript
case 'avg_hr_hills':
  const hillPulseActivities = filteredActivities.filter(a => {
    const distance = a.distance || 0;
    const elevation = a.total_elevation_gain || 0;
    return distance > 3000 && elevation >= distance * 0.025 && a.average_heartrate && a.average_heartrate > 0;
  });
  if (hillPulseActivities.length === 0) return 0;
  const hillAvgHR = hillPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / hillPulseActivities.length;
  return Math.round(hillAvgHR);
```

### 9. Avg Power (Средняя мощность)

**Описание**: Средняя мощность за период  
**Единица**: W  
**Расчет**: Физические формулы с учетом условий

```javascript
case 'avg_power':
  const powerActivities = filteredActivities.filter(a => a.distance > 1000);
  if (powerActivities.length === 0) return 0;
  
  const GRAVITY = 9.81;
  const CD_A = 0.4;
  const CRR = 0.005;
  const RIDER_WEIGHT = 75;
  const BIKE_WEIGHT = 8;
  
  const powerValues = powerActivities.map(activity => {
    const distance = parseFloat(activity.distance) || 0;
    const time = parseFloat(activity.moving_time) || 0;
    const elevationGain = parseFloat(activity.total_elevation_gain) || 0;
    const averageSpeed = parseFloat(activity.average_speed) || 0;
    const temperature = activity.average_temp;
    const maxElevation = activity.elev_high;
    
    const airDensity = calculateAirDensity(temperature, maxElevation);
    
    if (distance <= 0 || time <= 0 || averageSpeed <= 0) return 0;
    
    const averageGrade = elevationGain / distance;
    let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
    const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;
    const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
    
    let totalPower = rollingPower + aeroPower;
    
    if (averageGrade > 0) {
      totalPower += gravityPower;
    } else {
      totalPower += gravityPower;
      const minPowerOnDescent = 20;
      totalPower = Math.max(minPowerOnDescent, totalPower);
    }
    
    return isNaN(totalPower) || totalPower < 0 || totalPower > 10000 ? 0 : totalPower;
  }).filter(power => power > 0);
  
  if (powerValues.length === 0) return 0;
  return Math.round(powerValues.reduce((sum, power) => sum + power, 0) / powerValues.length);
```

### 10. Long Rides (Длинные поездки)

**Описание**: Количество длинных поездок  
**Единица**: количество  
**Фильтр**: `distance >= 50000m`

```javascript
case 'long_rides':
  return filteredActivities.filter(a => (a.distance || 0) >= 50000).length;
```

### 11. Intervals (Интервальные тренировки)

**Описание**: Количество интервальных тренировок  
**Единица**: количество  
**Критерии**:
- `type === 'Workout'` или `workout_type === 3`
- Ключевые слова в названии
- Анализ скоростных паттернов

```javascript
case 'intervals':
  const intervalActivities = filteredActivities.filter(a => {
    if (a.type === 'Workout' || a.workout_type === 3) return true;
    
    const name = (a.name || '').toLowerCase();
    const intervalKeywords = [
      'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
      'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
      'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
      'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid'
    ];
    
    if (intervalKeywords.some(keyword => name.includes(keyword))) return true;
    
    if (a.average_speed && a.max_speed) {
      const avgSpeed = a.average_speed * 3.6;
      const maxSpeed = a.max_speed * 3.6;
      const speedVariation = maxSpeed / avgSpeed;
      if (speedVariation > 1.4 && avgSpeed > 25) return true;
    }
    
    return false;
  });
  return intervalActivities.length;
```

### 12. Recovery (Восстановительные поездки)

**Описание**: Количество восстановительных поездок  
**Единица**: количество  
**Фильтр**: `type === 'Ride'` и `average_speed < 20`

```javascript
case 'recovery':
  return filteredActivities.filter(a => a.type === 'Ride' && (a.average_speed || 0) < 20).length;
```

### 13. FTP/VO2max Workouts ⭐

**Описание**: Время в высокоинтенсивных зонах  
**Единица**: минуты  
**Особенности**: Требует streams данные

```javascript
case 'ftp_vo2max':
  const hrThreshold = goal.hr_threshold !== null && goal.hr_threshold !== undefined ? goal.hr_threshold : 160;
  const durationThreshold = goal.duration_threshold !== null && goal.duration_threshold !== undefined ? goal.duration_threshold : 120;
  
  const periodDays = goal.period === '4w' ? 28 : 
                    goal.period === '3m' ? 92 : 
                    goal.period === 'year' ? 365 : 28;
  
  const { totalTimeMin } = analyzeHighIntensityTime(filteredActivities, periodDays, {
    hr_threshold: hrThreshold,
    duration_threshold: durationThreshold
  });
  
  return totalTimeMin;
```

## Система кэширования

### Кэширование результатов

```javascript
// Создание хеша активностей
const createActivitiesHash = (activities) => {
  return JSON.stringify(activities.map(a => ({ 
    id: a.id, 
    start_date: a.start_date, 
    distance: a.distance 
  })));
};

// Кэширование результатов
const cacheGoals = (activities, goals) => {
  const activitiesHash = createActivitiesHash(activities);
  const cacheKey = `goals_progress_${activitiesHash}`;
  
  const cacheData = {
    goals: goals,
    timestamp: Date.now()
  };
  
  localStorage.setItem(cacheKey, JSON.stringify(cacheData));
};
```

### Проверка кэша

```javascript
const getCachedGoals = (activities, goals) => {
  const activitiesHash = createActivitiesHash(activities);
  const cacheKey = `goals_progress_${activitiesHash}`;
  const cachedProgress = localStorage.getItem(cacheKey);
  
  if (cachedProgress) {
    const cachedData = JSON.parse(cachedProgress);
    if (Date.now() - cachedData.timestamp < CACHE_TTL.GOALS) {
      return cachedData.goals;
    }
  }
  
  return null;
};
```

## Оптимизации производительности

### 1. Ленивая загрузка streams

```javascript
// Загружаем streams только для FTP целей
const hasFTPGoals = goals.some(goal => goal.goal_type === 'ftp_vo2max');
if (hasFTPGoals) {
  await loadStreamsData(activities);
}
```

### 2. Хеширование изменений

```javascript
// Предотвращаем повторные расчеты
const activitiesHash = JSON.stringify(activities.map(a => ({ 
  id: a.id, 
  start_date: a.start_date, 
  distance: a.distance 
})));
```

### 3. Автоматическая очистка

```javascript
// Удаляем старые кэши
const cleanupOldGoalsCache = () => {
  const keys = Object.keys(localStorage);
  const goalCacheKeys = keys.filter(key => key.startsWith('goals_progress_'));
  
  const tenDaysAgo = Date.now() - CLEANUP_TTL.GOALS;
  
  goalCacheKeys.forEach(key => {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.timestamp && data.timestamp < tenDaysAgo) {
        localStorage.removeItem(key);
      }
    } catch (e) {
      localStorage.removeItem(key);
    }
  });
};
```

## Обработка ошибок

### Fallback значения

```javascript
try {
  const currentValue = calculateGoalProgress(goal, activities);
  return { ...goal, current_value: currentValue };
} catch (error) {
  console.error('Error calculating progress for goal:', goal.id, error);
  return { ...goal, current_value: 0 };
}
```

### Валидация данных

```javascript
// Проверяем наличие необходимых данных
if (!activities || activities.length === 0) return 0;
if (!goal || !goal.goal_type) return 0;

// Проверяем корректность значений
if (isNaN(result) || result < 0) return 0;
```

## Мониторинг

### Логирование расчетов

```javascript
console.log('🔄 Обнаружены изменения в активностях, запускаем пересчет целей...');
console.log('📊 Обнаружены изменения в целях, обновляем базу данных...');
console.log('✅ Цели успешно обновлены в базе данных и localStorage');
```

### Статистика производительности

```javascript
const performanceStats = {
  calculationTime: Date.now() - startTime,
  activitiesCount: activities.length,
  goalsCount: goals.length,
  cacheHit: cachedGoals !== null
};
```

## Будущие улучшения

1. **Машинное обучение** - предсказание достижимости целей
2. **Адаптивные пороги** - автоматическая настройка параметров
3. **Групповые сравнения** - сравнение с другими пользователями
4. **Временные тренды** - анализ прогресса во времени
5. **Персонализация** - индивидуальные настройки для каждого пользователя 