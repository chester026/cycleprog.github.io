const fs = require('fs');
const path = require('path');

// Загружаем базу знаний
const trainingTypes = JSON.parse(fs.readFileSync(path.join(__dirname, 'training-types.json'), 'utf8'));
const goalMapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'goal-mapping.json'), 'utf8'));

/**
 * Анализирует прогресс по целям и определяет приоритеты
 */
function analyzeGoalProgress(goals) {
  return goals.map(goal => {
    const progress = (goal.current_value / goal.target_value) * 100;
    const weeksLeft = calculateWeeksLeft(goal.period);
    const priority = calculatePriority(progress, weeksLeft, goal.goal_type);
    
    return {
      goalType: goal.goal_type,
      progress,
      weeksLeft,
      priority,
      currentValue: goal.current_value,
      targetValue: goal.target_value,
      unit: goal.unit
    };
  }).sort((a, b) => b.priority - a.priority);
}

/**
 * Вычисляет количество недель до окончания периода цели
 */
function calculateWeeksLeft(period) {
  const periodMap = {
    '1w': 1,
    '2w': 2,
    '4w': 4,
    '8w': 8,
    '12w': 12
  };
  return periodMap[period] || 4;
}

/**
 * Вычисляет приоритет цели на основе прогресса и времени
 */
function calculatePriority(progress, weeksLeft, goalType) {
  const basePriority = goalMapping.goal_to_training_mapping[goalType]?.priority_weight || 1.0;
  
  // Чем меньше прогресс, тем выше приоритет
  const progressFactor = Math.max(0.1, (100 - progress) / 100);
  
  // Чем меньше времени осталось, тем выше приоритет
  const timeFactor = Math.max(0.5, 1 / weeksLeft);
  
  return basePriority * progressFactor * timeFactor;
}

/**
 * Определяет приоритетные типы тренировок на основе целей
 */
function determineTrainingPriorities(goalAnalysis) {
  const trainingScores = {};
  
  goalAnalysis.forEach(goal => {
    const mapping = goalMapping.goal_to_training_mapping[goal.goalType];
    if (!mapping) return;
    
    // Добавляем очки за первичные типы тренировок
    mapping.primary.forEach(type => {
      trainingScores[type] = (trainingScores[type] || 0) + goal.priority * 2;
    });
    
    // Добавляем очки за вторичные типы тренировок
    mapping.secondary.forEach(type => {
      trainingScores[type] = (trainingScores[type] || 0) + goal.priority;
    });
  });
  
  // Сортируем по очкам
  return Object.entries(trainingScores)
    .sort(([,a], [,b]) => b - a)
    .map(([type]) => type);
}

/**
 * Ротирует приоритеты тренировок для создания разнообразия между неделями
 */
function rotateTrainingPriorities(priorities, weekVariation) {
  if (!priorities || priorities.length === 0) return priorities;
  
  // Создаем копию массива приоритетов
  const rotated = [...priorities];
  
  // В зависимости от недельной вариации меняем порядок
  switch (weekVariation % 3) {
    case 1:
      // Немного сдвигаем приоритеты - вторую тренировку делаем первой
      if (rotated.length > 1) {
        const secondPriority = rotated[1];
        rotated[1] = rotated[0];
        rotated[0] = secondPriority;
      }
      break;
    case 2:
      // Еще больше разнообразия - циклический сдвиг
      if (rotated.length > 2) {
        const first = rotated.shift();
        rotated.push(first);
      }
      break;
    default:
      // Оставляем исходный порядок
      break;
  }
  
  return rotated;
}

/**
 * Генерирует план тренировок на неделю
 */
function generateWeeklyPlan(goals, userProfile = {}, weekVariation = 0) {
  const goalAnalysis = analyzeGoalProgress(goals);
  const trainingPriorities = determineTrainingPriorities(goalAnalysis);
  const workoutsPerWeek = userProfile.workouts_per_week || 5;
  
  // Определяем дни для тренировок и отдыха
  const trainingDays = selectTrainingDays(workoutsPerWeek, userProfile);
  
  const weeklyPlan = {};
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Отслеживаем использованные типы тренировок для избежания повторений
  const usedTrainingTypes = new Set();
  
  // Добавляем ротацию приоритетов на основе вариации недели
  const rotatedPriorities = rotateTrainingPriorities(trainingPriorities, weekVariation);
  
  daysOfWeek.forEach(day => {
    if (trainingDays.includes(day)) {
      weeklyPlan[day] = generateTrainingDay(rotatedPriorities, day, userProfile, usedTrainingTypes, weekVariation);
      usedTrainingTypes.add(weeklyPlan[day].type);
    } else {
      weeklyPlan[day] = generateRestDay();
    }
  });
  
  return {
    plan: weeklyPlan,
    analysis: goalAnalysis,
    priorities: rotatedPriorities
  };
}

/**
 * Генерирует тренировочный день
 */
function generateTrainingDay(trainingPriorities, dayOfWeek, userProfile, usedTrainingTypes = new Set(), weekVariation = 0) {
  // Выбираем тип тренировки на основе приоритетов и дня недели
  const trainingType = selectTrainingType(trainingPriorities, dayOfWeek, userProfile, usedTrainingTypes, weekVariation);
  
  if (!trainingType) {
    return generateRestDay();
  }
  
  // Получаем информацию о типе тренировки
  const typeInfo = trainingTypes.training_types[trainingType];
  if (!typeInfo) {
    return generateRestDay();
  }
  
  // Адаптируем под профиль пользователя
  const adaptedInfo = adaptTrainingToUser(typeInfo, userProfile);
  
  return {
    type: trainingType,
    trainingType: trainingType,
    name: adaptedInfo.name,
    description: adaptedInfo.description,
    recommendation: `${adaptedInfo.name}: ${adaptedInfo.description}`,
    details: {
      intensity: adaptedInfo.intensity,
      duration: adaptedInfo.duration,
      cadence: adaptedInfo.cadence,
      hr_zones: adaptedInfo.hr_zones,
      structure: adaptedInfo.structure,
      benefits: adaptedInfo.benefits
    }
  };
}

/**
 * Выбирает дни недели для тренировок на основе количества тренировок в неделю
 */
function selectTrainingDays(workoutsPerWeek, userProfile = {}) {
  // Если у пользователя есть предпочитаемые дни, используем их
  if (userProfile.preferred_days && userProfile.preferred_days.length > 0) {
    return userProfile.preferred_days.slice(0, workoutsPerWeek);
  }
  
  // Иначе используем приоритетные дни по умолчанию
  const priorityDays = [
    'monday',    // Понедельник - начало недели
    'wednesday', // Среда - середина недели
    'friday',    // Пятница - конец рабочей недели
    'saturday',  // Суббота - выходной
    'tuesday',   // Вторник
    'thursday',  // Четверг
    'sunday'     // Воскресенье - обычно день отдыха
  ];
  
  // Выбираем первые N дней из приоритетного списка
  return priorityDays.slice(0, workoutsPerWeek);
}

/**
 * Выбирает тип тренировки для конкретного дня
 */
function selectTrainingType(trainingPriorities, dayOfWeek, userProfile, usedTrainingTypes = new Set(), weekVariation = 0) {
  // Базовое распределение типов тренировок по дням недели
  const baseDayMapping = {
    monday: ['endurance', 'tempo', 'threshold', 'cadence', 'strength'],
    tuesday: ['intervals', 'sweet_spot', 'over_under', 'pyramid', 'hill_climbing'],
    wednesday: ['endurance', 'recovery', 'group_ride', 'cadence'],
    thursday: ['strength', 'hill_climbing', 'time_trial', 'tempo'],
    friday: ['tempo', 'sweet_spot', 'threshold', 'cadence', 'intervals'],
    saturday: ['endurance', 'hill_climbing', 'group_ride', 'time_trial', 'strength'],
    sunday: ['recovery', 'endurance', 'group_ride', 'cadence']
  };
  
  // Создаем вариации распределения для разных недель
  let dayTypes = [...(baseDayMapping[dayOfWeek] || ['endurance'])];
  
  // Добавляем разнообразие в зависимости от недельной вариации
  if (weekVariation === 1) {
    // Неделя 1: меняем местами первые два типа
    if (dayTypes.length > 1) {
      [dayTypes[0], dayTypes[1]] = [dayTypes[1], dayTypes[0]];
    }
  } else if (weekVariation === 2) {
    // Неделя 2: циклический сдвиг типов
    if (dayTypes.length > 2) {
      const first = dayTypes.shift();
      dayTypes.push(first);
    }
  }
  
  // Сначала пытаемся найти приоритетный тип, который еще не использовался
  for (const priority of trainingPriorities) {
    if (dayTypes.includes(priority) && !usedTrainingTypes.has(priority)) {
      return priority;
    }
  }
  
  // Если все приоритетные типы уже использованы, выбираем любой доступный
  for (const priority of trainingPriorities) {
    if (dayTypes.includes(priority)) {
      return priority;
    }
  }
  
  // Если нет совпадений с приоритетами, выбираем первый неиспользованный тип
  for (const dayType of dayTypes) {
    if (!usedTrainingTypes.has(dayType)) {
      return dayType;
    }
  }
  
  // Если все типы уже использованы, возвращаем первый доступный
  return dayTypes[0];
}

/**
 * Генерирует день отдыха
 */
function generateRestDay() {
  return {
    type: 'rest',
    name: trainingTypes.rest_day.name,
    description: trainingTypes.rest_day.description,
    recommendation: 'Восстановление',
    details: {
      recommendations: trainingTypes.rest_day.recommendations,
      benefits: trainingTypes.rest_day.benefits
    }
  };
}

/**
 * Адаптирует тренировку под профиль пользователя
 */
function adaptTrainingToUser(trainingInfo, userProfile) {
  const { experience = 'intermediate', timeAvailable = 5 } = userProfile;
  const adjustments = goalMapping.experience_adjustments[experience] || goalMapping.experience_adjustments.intermediate;
  
  let adaptedInfo = { ...trainingInfo };
  
  // Адаптируем интенсивность
  if (adjustments.intensity_reduction !== 1.0) {
    adaptedInfo.intensity = adjustIntensity(trainingInfo.intensity, adjustments.intensity_reduction);
  }
  
  // Адаптируем длительность
  if (adjustments.duration_reduction !== 1.0) {
    adaptedInfo.duration = adjustDuration(trainingInfo.duration, adjustments.duration_reduction, timeAvailable);
  }
  
  // Адаптируем структуру тренировки
  if (adjustments.duration_reduction !== 1.0) {
    adaptedInfo.structure = adjustStructure(trainingInfo.structure, adjustments.duration_reduction);
  }
  
  return adaptedInfo;
}

/**
 * Адаптирует интенсивность тренировки
 */
function adjustIntensity(intensity, factor) {
  // Простая адаптация - можно сделать более сложной
  if (factor < 1.0) {
    return intensity.replace(/(\d+)/g, (match, num) => Math.round(num * factor));
  }
  return intensity;
}

/**
 * Адаптирует длительность тренировки
 */
function adjustDuration(duration, factor, timeAvailable) {
  // Если у пользователя мало времени, уменьшаем длительность
  const timeFactor = Math.min(factor, timeAvailable / 5);
  
  if (timeFactor < 1.0) {
    return duration.replace(/(\d+)/g, (match, num) => Math.round(num * timeFactor));
  }
  return duration;
}

/**
 * Адаптирует структуру тренировки
 */
function adjustStructure(structure, factor) {
  const adjusted = {};
  
  Object.keys(structure).forEach(key => {
    adjusted[key] = structure[key].replace(/(\d+)/g, (match, num) => Math.round(num * factor));
  });
  
  return adjusted;
}

/**
 * Получает рекомендации для конкретной цели
 */
function getGoalRecommendations(goalType) {
  const mapping = goalMapping.goal_to_training_mapping[goalType];
  if (!mapping) return null;
  
  const recommendations = {
    primary: mapping.primary.map(type => trainingTypes.training_types[type]),
    secondary: mapping.secondary.map(type => trainingTypes.training_types[type]),
    description: mapping.description
  };
  
  return recommendations;
}

/**
 * Получает информацию о типе тренировки
 */
function getTrainingTypeInfo(trainingType) {
  return trainingTypes.training_types[trainingType] || null;
}

module.exports = {
  analyzeGoalProgress,
  generateWeeklyPlan,
  getGoalRecommendations,
  getTrainingTypeInfo,
  determineTrainingPriorities,
  selectTrainingDays
}; 