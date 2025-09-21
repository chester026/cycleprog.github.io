// Утилита для генерации планов тренировок на основе уровня опыта

/**
 * Базовые планы тренировок для 4-недельного цикла
 */
const TRAINING_PLANS = {
  beginner: {
    rides: 8,           // 2 тренировки в неделю
    km: 200,            // 50км в неделю
    long: 2,            // 1 длинная поездка в 2 недели
    intervals: 4,       // 1 интервальная в неделю
    description: 'Basic plan for beginners',
    weeklyStructure: {
      rides: 2,
      volume: 50,
      longRides: 0.5,
      intervals: 1
    }
  },
  intermediate: {
    rides: 12,          // 3 тренировки в неделю
    km: 400,            // 100км в неделю  
    long: 4,            // 1 длинная поездка в неделю
    intervals: 8,       // 2 интервальные в неделю
    description: 'Balanced intermediate plan',
    weeklyStructure: {
      rides: 3,
      volume: 100,
      longRides: 1,
      intervals: 2
    }
  },
  advanced: {
    rides: 16,          // 4 тренировки в неделю
    km: 600,            // 150км в неделю
    long: 6,            // 1.5 длинные поездки в неделю
    intervals: 12,      // 3 интервальные в неделю
    description: 'Intense advanced plan',
    weeklyStructure: {
      rides: 4,
      volume: 150,
      longRides: 1.5,
      intervals: 3
    }
  }
};

/**
 * Модификаторы планов на основе доступного времени
 */
const TIME_MODIFIERS = {
  1: 0.3,   // 1 час в неделю - очень мало
  2: 0.5,   // 2 часа в неделю - мало
  3: 0.7,   // 3 часа в неделю - ограниченно
  4: 0.8,   // 4 часа в неделю - немного ниже базы
  5: 1.0,   // 5 часов в неделю - базовый план
  6: 1.1,   // 6 часов в неделю - чуть больше базы
  7: 1.2,   // 7 часов в неделю - увеличенный план
  8: 1.3,   // 8 часов в неделю - высокий объем
  9: 1.4,   // 9 часов в неделю - очень высокий объем
  10: 1.5   // 10+ часов в неделю - максимальный объем
};

/**
 * Получает план тренировок на основе уровня опыта и доступного времени
 * @param {string} experienceLevel - уровень опыта ('beginner', 'intermediate', 'advanced')
 * @param {number} timeAvailable - доступное время в часах в неделю (1-10)
 * @param {number} workoutsPerWeek - предпочтительное количество тренировок в неделю
 * @returns {Object} - план тренировок для 4-недельного цикла
 */
export const getTrainingPlan = (experienceLevel = 'intermediate', timeAvailable = 5, workoutsPerWeek = null) => {
  // Получаем базовый план
  const basePlan = TRAINING_PLANS[experienceLevel] || TRAINING_PLANS.intermediate;
  
  // Получаем модификатор времени
  const timeModifier = TIME_MODIFIERS[Math.min(10, Math.max(1, timeAvailable))] || 1.0;
  
  // Рассчитываем модифицированный план
  const modifiedPlan = {
    rides: Math.max(4, Math.round(basePlan.rides * timeModifier)),
    km: Math.max(100, Math.round(basePlan.km * timeModifier)),
    long: Math.max(1, Math.round(basePlan.long * timeModifier)),
    intervals: Math.max(2, Math.round(basePlan.intervals * timeModifier)),
    description: basePlan.description,
    experienceLevel,
    timeAvailable,
    timeModifier,
    weeklyStructure: {
      rides: Math.max(1, Math.round(basePlan.weeklyStructure.rides * timeModifier)),
      volume: Math.max(25, Math.round(basePlan.weeklyStructure.volume * timeModifier)),
      longRides: Math.max(0.25, basePlan.weeklyStructure.longRides * timeModifier),
      intervals: Math.max(0.5, Math.round(basePlan.weeklyStructure.intervals * timeModifier))
    }
  };
  
  // Если указано предпочтительное количество тренировок в неделю, корректируем
  if (workoutsPerWeek && workoutsPerWeek >= 1 && workoutsPerWeek <= 7) {
    const weeklyRidesModifier = workoutsPerWeek / basePlan.weeklyStructure.rides;
    modifiedPlan.rides = Math.max(4, Math.round(workoutsPerWeek * 4)); // 4 недели
    modifiedPlan.weeklyStructure.rides = workoutsPerWeek;
    
    // Корректируем другие показатели пропорционально
    if (weeklyRidesModifier < 1) {
      // Если тренировок меньше, снижаем интенсивность
      modifiedPlan.intervals = Math.max(2, Math.round(modifiedPlan.intervals * weeklyRidesModifier));
    }
  }
  
  return modifiedPlan;
};

/**
 * Получает описание плана для отображения
 * @param {Object} plan - план тренировок
 * @returns {string} - человеко-читаемое описание плана
 */
export const getPlanDescription = (plan) => {
  const { weeklyStructure, experienceLevel } = plan;
  
  const levelNames = {
    beginner: 'Beginner',
    intermediate: 'Intermediate', 
    advanced: 'Advanced'
  };
  
  return `${levelNames[experienceLevel] || 'Intermediate'} plan: ${weeklyStructure.rides} rides/week, ${weeklyStructure.volume}km/week`;
};

/**
 * Получает план на основе профиля пользователя
 * @param {Object} userProfile - профиль пользователя
 * @returns {Object} - план тренировок
 */
export const getPlanFromProfile = (userProfile) => {
  if (!userProfile) {
    return getTrainingPlan('intermediate', 5, 3);
  }
  
  const experienceLevel = userProfile.experience_level || 'intermediate';
  const timeAvailable = userProfile.time_available || 5;
  const workoutsPerWeek = userProfile.workouts_per_week || null;
  
  return getTrainingPlan(experienceLevel, timeAvailable, workoutsPerWeek);
};

/**
 * Валидирует параметры плана
 * @param {string} experienceLevel - уровень опыта
 * @param {number} timeAvailable - доступное время
 * @param {number} workoutsPerWeek - тренировок в неделю
 * @returns {Object} - результат валидации с ошибками если есть
 */
export const validatePlanParams = (experienceLevel, timeAvailable, workoutsPerWeek) => {
  const errors = [];
  
  if (!['beginner', 'intermediate', 'advanced'].includes(experienceLevel)) {
    errors.push('Invalid experience level');
  }
  
  if (timeAvailable < 1 || timeAvailable > 10) {
    errors.push('Time available must be between 1 and 10 hours per week');
  }
  
  if (workoutsPerWeek !== null && (workoutsPerWeek < 1 || workoutsPerWeek > 7)) {
    errors.push('Workouts per week must be between 1 and 7');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Экспорт планов для тестирования
export { TRAINING_PLANS, TIME_MODIFIERS };
