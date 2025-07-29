# Примеры использования системы целей

## Создание целей

### 1. Базовая цель (Distance)

```javascript
// Создание цели на дистанцию
const distanceGoal = {
  title: "Месячная дистанция",
  description: "Проехать 500 км за месяц",
  target_value: 500,
  unit: "km",
  goal_type: "distance",
  period: "4w"
};

// POST /api/goals
const response = await fetch('/api/goals', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(distanceGoal)
});
```

### 2. Цель с пользовательскими настройками (FTP/VO2max)

```javascript
// Создание FTP/VO2max цели с кастомными настройками
const ftpGoal = {
  title: "Высокоинтенсивные тренировки",
  description: "Провести 120 минут в высокоинтенсивных зонах",
  target_value: 120,
  unit: "minutes",
  goal_type: "ftp_vo2max",
  period: "4w",
  hr_threshold: 155,        // Кастомный пороговый пульс
  duration_threshold: 90    // Кастомная минимальная длительность (секунды)
};

// POST /api/goals
const response = await fetch('/api/goals', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(ftpGoal)
});
```

### 3. Цель на скорость

```javascript
// Создание цели на скорость на равнине
const speedGoal = {
  title: "Скорость на равнине",
  description: "Достичь средней скорости 28 км/ч на равнинных участках",
  target_value: 28,
  unit: "km/h",
  goal_type: "speed_flat",
  period: "4w"
};
```

## Получение и обновление целей

### 1. Получение всех целей пользователя

```javascript
// GET /api/goals
const response = await fetch('/api/goals', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const goals = await response.json();
console.log('Цели пользователя:', goals);
```

### 2. Обновление цели

```javascript
// PUT /api/goals/:id
const updatedGoal = {
  title: "Обновленная цель",
  description: "Новое описание",
  target_value: 600,
  unit: "km",
  goal_type: "distance",
  period: "4w"
};

const response = await fetch(`/api/goals/${goalId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(updatedGoal)
});
```

### 3. Удаление цели

```javascript
// DELETE /api/goals/:id
const response = await fetch(`/api/goals/${goalId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Автоматическое обновление целей

### 1. При загрузке активностей из Strava

```javascript
// В PlanPage.jsx
useEffect(() => {
  if (activities.length > 0 && personalGoals.length > 0) {
    // Проверяем, изменились ли активности
    const activitiesHash = JSON.stringify(activities.map(a => ({ 
      id: a.id, 
      start_date: a.start_date, 
      distance: a.distance 
    })));
    
    if (updateGoalsOnActivitiesChange.lastHash !== activitiesHash) {
      updateGoalsOnActivitiesChange.lastHash = activitiesHash;
      updateGoalsOnActivitiesChange(activities);
    }
  }
}, [activities, personalGoals.length]);
```

### 2. При добавлении ручной поездки

```javascript
// В server.js - автоматически вызывается updateUserGoals
app.post('/api/rides', authMiddleware, async (req, res) => {
  // ... добавление поездки
  
  // Автоматически обновляем цели
  await updateUserGoals(userId, req.headers.authorization);
  
  res.json({ success: true });
});
```

## Примеры расчетов

### 1. Расчет дистанции за 4 недели

```javascript
const activities = [
  { distance: 25000, start_date: '2025-01-01' }, // 25 км
  { distance: 30000, start_date: '2025-01-08' }, // 30 км
  { distance: 20000, start_date: '2025-01-15' }, // 20 км
  { distance: 35000, start_date: '2025-01-22' }  // 35 км
];

const totalDistance = activities.reduce((sum, activity) => {
  return sum + (activity.distance || 0);
}, 0) / 1000; // 110 км

console.log(`Общая дистанция: ${totalDistance} км`);
```

### 2. Расчет средней скорости на равнине

```javascript
const activities = [
  { 
    distance: 25000, 
    total_elevation_gain: 500, 
    average_speed: 8.33, // 30 км/ч
    start_date: '2025-01-01' 
  },
  { 
    distance: 30000, 
    total_elevation_gain: 400, 
    average_speed: 8.89, // 32 км/ч
    start_date: '2025-01-08' 
  }
];

// Фильтрация равнинных активностей (уклон < 3%)
const flatActivities = activities.filter(activity => {
  const distance = activity.distance || 0;
  const elevation = activity.total_elevation_gain || 0;
  return distance > 3000 && elevation < distance * 0.03;
});

// Расчет средней скорости
const speeds = flatActivities.map(activity => {
  return (activity.average_speed || 0) * 3.6; // м/с -> км/ч
});

const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
console.log(`Средняя скорость на равнине: ${avgSpeed.toFixed(1)} км/ч`);
```

### 3. Расчет FTP/VO2max времени

```javascript
const activities = [
  {
    average_heartrate: 165,
    moving_time: 3600, // 1 час
    start_date: '2025-01-01'
  },
  {
    average_heartrate: 170,
    moving_time: 1800, // 30 минут
    start_date: '2025-01-08'
  }
];

const hrThreshold = 160;
const durationThreshold = 120; // 2 минуты

let totalHighIntensityTime = 0;

for (const activity of activities) {
  if (activity.average_heartrate >= hrThreshold && 
      activity.moving_time >= durationThreshold) {
    totalHighIntensityTime += activity.moving_time / 60; // в минутах
  }
}

console.log(`Время в высокоинтенсивных зонах: ${totalHighIntensityTime} минут`);
```

## Тестирование системы

### 1. Тест создания цели

```javascript
// test-goals.js
const testCreateGoal = async () => {
  const goal = {
    title: "Тестовая цель",
    description: "Цель для тестирования",
    target_value: 100,
    unit: "km",
    goal_type: "distance",
    period: "4w"
  };

  try {
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify(goal)
    });

    const result = await response.json();
    console.log('Цель создана:', result);
    
    // Проверяем, что цель создана корректно
    assert(result.id);
    assert(result.title === goal.title);
    assert(result.target_value === goal.target_value);
    
    return result.id;
  } catch (error) {
    console.error('Ошибка создания цели:', error);
  }
};
```

### 2. Тест автоматического обновления

```javascript
// test-auto-update.js
const testAutoUpdate = async () => {
  // 1. Создаем цель
  const goalId = await testCreateGoal();
  
  // 2. Добавляем поездку
  const ride = {
    distance: 25000,
    moving_time: 3600,
    start_date: new Date().toISOString(),
    type: 'Ride'
  };

  const response = await fetch('/api/rides', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify(ride)
  });

  // 3. Проверяем, что цель обновилась
  const goalsResponse = await fetch('/api/goals', {
    headers: {
      'Authorization': `Bearer ${testToken}`
    }
  });

  const goals = await goalsResponse.json();
  const updatedGoal = goals.find(g => g.id === goalId);
  
  console.log('Цель после обновления:', updatedGoal);
  assert(updatedGoal.current_value > 0);
};
```

### 3. Тест FTP/VO2max настроек

```javascript
// test-ftp-settings.js
const testFTPSettings = async () => {
  // 1. Создаем FTP цель с кастомными настройками
  const ftpGoal = {
    title: "FTP тест",
    target_value: 60,
    unit: "minutes",
    goal_type: "ftp_vo2max",
    period: "4w",
    hr_threshold: 155,
    duration_threshold: 90
  };

  const createResponse = await fetch('/api/goals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify(ftpGoal)
  });

  const createdGoal = await createResponse.json();
  
  // 2. Проверяем, что настройки сохранились
  assert(createdGoal.hr_threshold === 155);
  assert(createdGoal.duration_threshold === 90);
  
  // 3. Обновляем цель
  const updateResponse = await fetch(`/api/goals/${createdGoal.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify({
      ...createdGoal,
      hr_threshold: 160,
      duration_threshold: 120
    })
  });

  const updatedGoal = await updateResponse.json();
  
  // 4. Проверяем, что настройки обновились
  assert(updatedGoal.hr_threshold === 160);
  assert(updatedGoal.duration_threshold === 120);
};
```

## Примеры интеграции

### 1. Интеграция с React компонентом

```jsx
// GoalsManager.jsx
const GoalsManager = () => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      const response = await apiFetch('/api/goals');
      const goalsData = await response.json();
      setGoals(goalsData);
    } catch (error) {
      console.error('Ошибка загрузки целей:', error);
    } finally {
      setLoading(false);
    }
  };

  const createGoal = async (goalData) => {
    try {
      const response = await apiFetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
      });
      
      const newGoal = await response.json();
      setGoals(prev => [...prev, newGoal]);
      return newGoal;
    } catch (error) {
      console.error('Ошибка создания цели:', error);
      throw error;
    }
  };

  const updateGoal = async (goalId, goalData) => {
    try {
      const response = await apiFetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
      });
      
      const updatedGoal = await response.json();
      setGoals(prev => prev.map(g => g.id === goalId ? updatedGoal : g));
      return updatedGoal;
    } catch (error) {
      console.error('Ошибка обновления цели:', error);
      throw error;
    }
  };

  const deleteGoal = async (goalId) => {
    try {
      await apiFetch(`/api/goals/${goalId}`, {
        method: 'DELETE'
      });
      
      setGoals(prev => prev.filter(g => g.id !== goalId));
    } catch (error) {
      console.error('Ошибка удаления цели:', error);
      throw error;
    }
  };

  return (
    <div className="goals-manager">
      {loading ? (
        <div>Загрузка целей...</div>
      ) : (
        <>
          <h2>Мои цели</h2>
          {goals.map(goal => (
            <GoalCard 
              key={goal.id}
              goal={goal}
              onUpdate={updateGoal}
              onDelete={deleteGoal}
            />
          ))}
          <CreateGoalForm onSubmit={createGoal} />
        </>
      )}
    </div>
  );
};
```

### 2. Интеграция с графиками

```jsx
// ProgressChart.jsx
const ProgressChart = ({ goal, activities }) => {
  const calculateProgress = useMemo(() => {
    if (!activities || activities.length === 0) return 0;
    
    // Фильтрация по периоду
    const filteredActivities = filterActivitiesByPeriod(activities, goal.period);
    
    // Расчет текущего значения
    let currentValue = 0;
    
    switch (goal.goal_type) {
      case 'distance':
        currentValue = filteredActivities.reduce((sum, a) => 
          sum + (a.distance || 0), 0) / 1000;
        break;
        
      case 'ftp_vo2max':
        currentValue = calculateFTPVO2max(filteredActivities, goal.period, {
          hr_threshold: goal.hr_threshold,
          duration_threshold: goal.duration_threshold
        }).totalTimeMin;
        break;
        
      // ... другие типы
    }
    
    return (currentValue / goal.target_value) * 100;
  }, [goal, activities]);

  return (
    <div className="progress-chart">
      <h3>{goal.title}</h3>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${Math.min(100, calculateProgress)}%` }}
        />
      </div>
      <div className="progress-text">
        {calculateProgress.toFixed(1)}% выполнено
      </div>
    </div>
  );
};
```

## Отладка и мониторинг

### 1. Логирование расчетов

```javascript
// В server.js
const updateUserGoals = async (userId, authHeader) => {
  console.log(`🔍 Обновление целей для пользователя ${userId}`);
  
  try {
    const goals = await getGoals(userId);
    const activities = await getActivities(userId, authHeader);
    
    for (const goal of goals) {
      const oldValue = goal.current_value;
      const newValue = calculateGoalValue(activities, goal);
      
      if (newValue !== oldValue) {
        console.log(`📊 Цель "${goal.title}": ${oldValue} → ${newValue}`);
        await updateGoal(userId, goal.id, newValue);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка обновления целей:', error);
  }
};
```

### 2. Мониторинг производительности

```javascript
// performance-monitor.js
const monitorGoalCalculation = (goalType, startTime) => {
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`⏱️ Расчет цели ${goalType}: ${duration}ms`);
  
  if (duration > 1000) {
    console.warn(`⚠️ Медленный расчет цели ${goalType}: ${duration}ms`);
  }
};

// Использование
const startTime = Date.now();
const result = calculateGoalValue(activities, goal);
monitorGoalCalculation(goal.goal_type, startTime);
```

### 3. Валидация данных

```javascript
// validation.js
const validateGoalData = (goal) => {
  const errors = [];
  
  if (!goal.title || goal.title.trim().length === 0) {
    errors.push('Название цели обязательно');
  }
  
  if (!goal.target_value || goal.target_value <= 0) {
    errors.push('Целевое значение должно быть больше 0');
  }
  
  if (!['4w', '3m', 'year'].includes(goal.period)) {
    errors.push('Неверный период');
  }
  
  if (goal.goal_type === 'ftp_vo2max') {
    if (goal.hr_threshold && (goal.hr_threshold < 100 || goal.hr_threshold > 200)) {
      errors.push('Пороговый пульс должен быть между 100 и 200');
    }
    
    if (goal.duration_threshold && (goal.duration_threshold < 30 || goal.duration_threshold > 600)) {
      errors.push('Минимальная длительность должна быть между 30 и 600 секунд');
    }
  }
  
  return errors;
};
```

## Заключение

Система целей предоставляет гибкий и мощный инструмент для отслеживания прогресса в велоспорте. Автоматическое обновление, пользовательские настройки для FTP/VO2max целей и интеграция с Strava делают систему удобной и эффективной для пользователей.

Ключевые особенности:
- ✅ Автоматическое обновление при появлении новых заездов
- ✅ Пользовательские настройки для FTP/VO2max целей
- ✅ Поддержка 17 различных типов целей
- ✅ Кэширование для оптимизации производительности
- ✅ Валидация данных и обработка ошибок
- ✅ Интеграция с React и графиками 