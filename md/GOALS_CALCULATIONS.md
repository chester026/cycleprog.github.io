# Алгоритмы расчетов целей

## Общие принципы

### Фильтрация по периоду

Все цели используют фильтрацию активностей по периоду:

```javascript
const filterActivitiesByPeriod = (activities, period) => {
  const now = new Date();
  
  switch (period) {
    case '4w':
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      return activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    
    case '3m':
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      return activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    
    case 'year':
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return activities.filter(a => new Date(a.start_date) > yearAgo);
    
    default:
      return activities;
  }
};
```

### Фильтрация по типу активности

Все расчеты учитывают только активности типа 'Ride':

```javascript
const rides = activities.filter(activity => activity.type === 'Ride');
```

## Детальные алгоритмы

### 1. Distance (Дистанция)

```javascript
const calculateDistance = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  return filteredActivities.reduce((sum, activity) => {
    return sum + (activity.distance || 0);
  }, 0) / 1000; // Конвертация в километры
};
```

**Входные данные:**
- `activities`: Массив активностей из Strava
- `period`: Период ('4w', '3m', 'year')

**Выходные данные:**
- Общая дистанция в километрах

### 2. Time (Время)

```javascript
const calculateTime = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  const totalSeconds = filteredActivities.reduce((sum, activity) => {
    return sum + (activity.moving_time || 0);
  }, 0);
  return totalSeconds / 3600; // Конвертация в часы
};
```

**Входные данные:**
- `activities`: Массив активностей из Strava
- `period`: Период ('4w', '3m', 'year')

**Выходные данные:**
- Общее время в движении в часах

### 3. Elevation (Набор высоты)

```javascript
const calculateElevation = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  return filteredActivities.reduce((sum, activity) => {
    return sum + (activity.total_elevation_gain || 0);
  }, 0); // В метрах
};
```

**Входные данные:**
- `activities`: Массив активностей из Strava
- `period`: Период ('4w', '3m', 'year')

**Выходные данные:**
- Общий набор высоты в метрах

### 4. Speed Flat (Скорость на равнине)

```javascript
const calculateSpeedFlat = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация равнинных активностей
  const flatActivities = filteredActivities.filter(activity => {
    const distance = activity.distance || 0;
    const elevation = activity.total_elevation_gain || 0;
    return distance > 3000 && elevation < distance * 0.03; // 3% уклон
  });
  
  if (flatActivities.length === 0) return 0;
  
  // Расчет средней скорости
  const speeds = flatActivities.map(activity => {
    return (activity.average_speed || 0) * 3.6; // м/с -> км/ч
  });
  
  return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
};
```

**Критерии равнинной активности:**
- Дистанция > 3000 метров
- Уклон < 3% (elevation < distance * 0.03)

### 5. Speed Hills (Скорость в горах)

```javascript
const calculateSpeedHills = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация горных активностей
  const hillActivities = filteredActivities.filter(activity => {
    const distance = activity.distance || 0;
    const elevation = activity.total_elevation_gain || 0;
    return distance > 3000 && elevation >= distance * 0.025; // 2.5% уклон
  });
  
  if (hillActivities.length === 0) return 0;
  
  // Расчет средней скорости
  const speeds = hillActivities.map(activity => {
    return (activity.average_speed || 0) * 3.6; // м/с -> км/ч
  });
  
  return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
};
```

**Критерии горной активности:**
- Дистанция > 3000 метров
- Уклон >= 2.5% (elevation >= distance * 0.025)

### 6. Pulse (Средний пульс)

```javascript
const calculatePulse = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация активностей с данными о пульсе
  const activitiesWithHR = filteredActivities.filter(activity => 
    activity.average_heartrate && activity.average_heartrate > 0
  );
  
  if (activitiesWithHR.length === 0) return 0;
  
  const totalHR = activitiesWithHR.reduce((sum, activity) => {
    return sum + activity.average_heartrate;
  }, 0);
  
  return totalHR / activitiesWithHR.length;
};
```

### 7. Avg HR Flat (Средний пульс на равнине)

```javascript
const calculateAvgHRFlat = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация равнинных активностей с данными о пульсе
  const flatActivitiesWithHR = filteredActivities.filter(activity => {
    const distance = activity.distance || 0;
    const elevation = activity.total_elevation_gain || 0;
    const hasHR = activity.average_heartrate && activity.average_heartrate > 0;
    return distance > 3000 && elevation < distance * 0.03 && hasHR;
  });
  
  if (flatActivitiesWithHR.length === 0) return 0;
  
  const totalHR = flatActivitiesWithHR.reduce((sum, activity) => {
    return sum + activity.average_heartrate;
  }, 0);
  
  return totalHR / flatActivitiesWithHR.length;
};
```

### 8. Avg HR Hills (Средний пульс в горах)

```javascript
const calculateAvgHRHills = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация горных активностей с данными о пульсе
  const hillActivitiesWithHR = filteredActivities.filter(activity => {
    const distance = activity.distance || 0;
    const elevation = activity.total_elevation_gain || 0;
    const hasHR = activity.average_heartrate && activity.average_heartrate > 0;
    return distance > 3000 && elevation >= distance * 0.025 && hasHR;
  });
  
  if (hillActivitiesWithHR.length === 0) return 0;
  
  const totalHR = hillActivitiesWithHR.reduce((sum, activity) => {
    return sum + activity.average_heartrate;
  }, 0);
  
  return totalHR / hillActivitiesWithHR.length;
};
```

### 9. Avg Power (Средняя мощность)

```javascript
const calculateAvgPower = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация активностей с данными о мощности
  const activitiesWithPower = filteredActivities.filter(activity => 
    activity.average_watts && activity.average_watts > 0
  );
  
  if (activitiesWithPower.length === 0) return 0;
  
  const totalPower = activitiesWithPower.reduce((sum, activity) => {
    return sum + activity.average_watts;
  }, 0);
  
  return totalPower / activitiesWithPower.length;
};
```

### 10. Long Rides (Длинные заезды)

```javascript
const calculateLongRides = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  return filteredActivities.filter(activity => {
    return (activity.distance || 0) >= 50000; // 50 км
  }).length;
};
```

**Критерий длинного заезда:**
- Дистанция >= 50 километров

### 11. Intervals (Интервальные тренировки)

```javascript
const calculateIntervals = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  return filteredActivities.filter(activity => {
    // 1. Проверка типа активности
    if (activity.type === 'Workout' || activity.workout_type === 3) {
      return true;
    }
    
    // 2. Анализ названия активности
    const name = (activity.name || '').toLowerCase();
    const intervalKeywords = [
      'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
      'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
      'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
      'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid'
    ];
    
    if (intervalKeywords.some(keyword => name.includes(keyword))) {
      return true;
    }
    
    // 3. Анализ скоростных паттернов
    if (activity.average_speed && activity.max_speed) {
      const avgSpeed = activity.average_speed * 3.6; // м/с -> км/ч
      const maxSpeed = activity.max_speed * 3.6;
      const speedRatio = maxSpeed / avgSpeed;
      
      // Если максимальная скорость значительно выше средней
      if (speedRatio > 1.3) {
        return true;
      }
    }
    
    return false;
  }).length;
};
```

### 12. Recovery (Восстановительные заезды)

```javascript
const calculateRecovery = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  return filteredActivities.filter(activity => {
    const avgHR = activity.average_heartrate || 0;
    const avgSpeed = (activity.average_speed || 0) * 3.6; // км/ч
    
    // Критерии восстановительной активности:
    // 1. Низкий пульс (Z2-Z3)
    // 2. Низкая скорость
    // 3. Небольшая дистанция
    
    const isLowHR = avgHR > 0 && avgHR < 150; // Примерная граница Z3
    const isLowSpeed = avgSpeed > 0 && avgSpeed < 25; // Низкая скорость
    const isShortDistance = (activity.distance || 0) < 30000; // < 30 км
    
    return isLowHR && isLowSpeed && isShortDistance;
  }).length;
};
```

### 13. FTP/VO2max Workouts ⭐

```javascript
const calculateFTPVO2max = (activities, period, settings) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Настройки по умолчанию
  const hrThreshold = settings?.hr_threshold || 160;
  const durationThreshold = settings?.duration_threshold || 120;
  
  let totalHighIntensityTime = 0;
  let highIntensitySessions = 0;
  
  for (const activity of filteredActivities) {
    // Анализ секундных данных пульса
    if (activity.heartrate_data) {
      const { highIntensityTime, sessions } = analyzeHeartRateData(
        activity.heartrate_data,
        hrThreshold,
        durationThreshold
      );
      
      totalHighIntensityTime += highIntensityTime;
      highIntensitySessions += sessions;
    }
    
    // Анализ по средним показателям (если нет секундных данных)
    else if (activity.average_heartrate && activity.average_heartrate >= hrThreshold) {
      const activityTime = activity.moving_time || 0;
      if (activityTime >= durationThreshold) {
        totalHighIntensityTime += activityTime / 60; // Конвертация в минуты
        highIntensitySessions += 1;
      }
    }
  }
  
  return {
    totalTimeMin: totalHighIntensityTime,
    sessions: highIntensitySessions
  };
};

// Анализ секундных данных пульса
const analyzeHeartRateData = (heartrateData, hrThreshold, durationThreshold) => {
  let highIntensityTime = 0;
  let sessions = 0;
  let currentSessionTime = 0;
  
  for (let i = 0; i < heartrateData.length; i++) {
    const hr = heartrateData[i];
    
    if (hr >= hrThreshold) {
      currentSessionTime += 1; // 1 секунда
    } else {
      // Проверяем, была ли сессия достаточно длинной
      if (currentSessionTime >= durationThreshold) {
        highIntensityTime += currentSessionTime;
        sessions += 1;
      }
      currentSessionTime = 0;
    }
  }
  
  // Проверяем последнюю сессию
  if (currentSessionTime >= durationThreshold) {
    highIntensityTime += currentSessionTime;
    sessions += 1;
  }
  
  return {
    highIntensityTime: highIntensityTime / 60, // Конвертация в минуты
    sessions: sessions
  };
};
```

**Особенности FTP/VO2max расчетов:**
- Использует пользовательские настройки `hr_threshold` и `duration_threshold`
- Анализирует секундные данные пульса (если доступны)
- Учитывает только сессии выше порогового пульса
- Минимальная длительность сессии настраивается пользователем

### 14. VO2max (Оценка)

```javascript
const calculateVO2max = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  if (filteredActivities.length === 0) return 0;
  
  // Базовые показатели
  const bestSpeed = Math.max(...filteredActivities.map(a => (a.average_speed || 0) * 3.6));
  const avgHR = filteredActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / 
                filteredActivities.filter(a => a.average_heartrate).length;
  
  // Анализ высокоинтенсивных тренировок
  const { totalTimeMin, highIntensitySessions } = analyzeHighIntensityTime(
    filteredActivities, 
    period, 
    { hr_threshold: 160, duration_threshold: 120 }
  );
  
  // Базовая формула оценки VO2max
  let baseVO2max = (bestSpeed * 1.2) + (avgHR * 0.05);
  
  // Бонус за интервальные тренировки
  let intensityBonus = 0;
  if (totalTimeMin >= 120) intensityBonus = 4;
  else if (totalTimeMin >= 60) intensityBonus = 2.5;
  else if (totalTimeMin >= 30) intensityBonus = 1;
  
  if (highIntensitySessions >= 6) intensityBonus += 1.5;
  else if (highIntensitySessions >= 3) intensityBonus += 0.5;
  
  const estimatedVO2max = Math.min(80, Math.max(30, Math.round(baseVO2max + intensityBonus)));
  
  return estimatedVO2max;
};
```

### 15. FTP (Оценка)

```javascript
const calculateFTP = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Фильтрация активностей с данными о мощности
  const activitiesWithPower = filteredActivities.filter(activity => 
    activity.average_watts && activity.average_watts > 0
  );
  
  if (activitiesWithPower.length === 0) return 0;
  
  // FTP обычно составляет 95% от 20-минутной мощности
  // Используем лучшие 20-минутные сегменты
  let best20minPower = 0;
  
  for (const activity of activitiesWithPower) {
    if (activity.moving_time >= 1200) { // 20 минут
      const power = activity.average_watts;
      if (power > best20minPower) {
        best20minPower = power;
      }
    }
  }
  
  // Если нет 20-минутных активностей, используем среднюю мощность
  if (best20minPower === 0) {
    const avgPower = activitiesWithPower.reduce((sum, a) => sum + a.average_watts, 0) / 
                    activitiesWithPower.length;
    return Math.round(avgPower * 0.95); // 95% от средней мощности
  }
  
  return Math.round(best20minPower * 0.95); // 95% от лучшей 20-минутной мощности
};
```

### 16. Rides (Количество заездов)

```javascript
const calculateRides = (activities, period) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  return filteredActivities.filter(activity => 
    activity.type === 'Ride'
  ).length;
};
```

### 17. Avg Per Week (Среднее в неделю)

```javascript
const calculateAvgPerWeek = (activities, period, goalType) => {
  const filteredActivities = filterActivitiesByPeriod(activities, period);
  
  // Определяем количество недель в периоде
  let weeksInPeriod;
  switch (period) {
    case '4w': weeksInPeriod = 4; break;
    case '3m': weeksInPeriod = 12; break;
    case 'year': weeksInPeriod = 52; break;
    default: weeksInPeriod = 4;
  }
  
  // Рассчитываем общее значение для периода
  const totalValue = calculateGoalValue(filteredActivities, goalType);
  
  return totalValue / weeksInPeriod;
};

// Вспомогательная функция для расчета значения по типу цели
const calculateGoalValue = (activities, goalType) => {
  switch (goalType) {
    case 'distance':
      return activities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    case 'time':
      return activities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
    case 'elevation':
      return activities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
    // ... другие типы
    default:
      return 0;
  }
};
```

## Оптимизация производительности

### Кэширование результатов

```javascript
const goalCalculationCache = new Map();

const getCachedCalculation = (activities, period, goalType, settings) => {
  const cacheKey = JSON.stringify({
    activitiesHash: activities.map(a => ({ id: a.id, start_date: a.start_date })),
    period,
    goalType,
    settings
  });
  
  return goalCalculationCache.get(cacheKey);
};

const setCachedCalculation = (activities, period, goalType, settings, result) => {
  const cacheKey = JSON.stringify({
    activitiesHash: activities.map(a => ({ id: a.id, start_date: a.start_date })),
    period,
    goalType,
    settings
  });
  
  goalCalculationCache.set(cacheKey, {
    result,
    timestamp: Date.now()
  });
};
```

### Ленивые вычисления

```javascript
const calculateGoalProgress = (goal, activities) => {
  // Проверяем кэш
  const cached = getCachedCalculation(activities, goal.period, goal.goal_type, {
    hr_threshold: goal.hr_threshold,
    duration_threshold: goal.duration_threshold
  });
  
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 минут
    return cached.result;
  }
  
  // Вычисляем результат
  const result = calculateGoalValue(activities, goal.period, goal.goal_type, {
    hr_threshold: goal.hr_threshold,
    duration_threshold: goal.duration_threshold
  });
  
  // Сохраняем в кэш
  setCachedCalculation(activities, goal.period, goal.goal_type, {
    hr_threshold: goal.hr_threshold,
    duration_threshold: goal.duration_threshold
  }, result);
  
  return result;
};
```

## Валидация данных

### Проверка входных данных

```javascript
const validateActivity = (activity) => {
  const errors = [];
  
  if (!activity.start_date) {
    errors.push('Missing start_date');
  }
  
  if (activity.distance && activity.distance < 0) {
    errors.push('Invalid distance');
  }
  
  if (activity.moving_time && activity.moving_time < 0) {
    errors.push('Invalid moving_time');
  }
  
  if (activity.average_heartrate && (activity.average_heartrate < 40 || activity.average_heartrate > 220)) {
    errors.push('Invalid heart rate');
  }
  
  return errors;
};
```

### Обработка отсутствующих данных

```javascript
const safeGet = (obj, path, defaultValue = 0) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : defaultValue;
  }, obj);
};

// Использование
const distance = safeGet(activity, 'distance', 0);
const heartRate = safeGet(activity, 'average_heartrate', 0);
``` 