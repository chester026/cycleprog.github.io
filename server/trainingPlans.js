// Серверная утилита для генерации планов тренировок на основе уровня опыта

/**
 * Базовые планы тренировок для 4-недельного цикла
 */
const TRAINING_PLANS = {
  beginner: {
    rides: 8,           // 2 тренировки в неделю
    km: 200,            // 50км в неделю
    long: 2,            // 1 длинная поездка в 2 недели
    intervals: 4,       // 1 интервальная в неделю
    description: 'Basic plan for beginners'
  },
  intermediate: {
    rides: 12,          // 3 тренировки в неделю
    km: 400,            // 100км в неделю  
    long: 4,            // 1 длинная поездка в неделю
    intervals: 8,       // 2 интервальные в неделю
    description: 'Balanced plan for intermediate cyclists'
  },
  advanced: {
    rides: 16,          // 4 тренировки в неделю
    km: 600,            // 150км в неделю
    long: 6,            // 1.5 длинные поездки в неделю
    intervals: 12,      // 3 интервальные в неделю
    description: 'Intense plan for advanced cyclists'
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
function getTrainingPlan(experienceLevel = 'intermediate', timeAvailable = 5, workoutsPerWeek = null) {
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
    timeModifier
  };
  
  // Если указано предпочтительное количество тренировок в неделю, корректируем
  if (workoutsPerWeek && workoutsPerWeek >= 1 && workoutsPerWeek <= 7) {
    const basePlanWeeklyRides = Math.round(basePlan.rides / 4); // базовые тренировки в неделю
    const weeklyRidesModifier = workoutsPerWeek / basePlanWeeklyRides;
    modifiedPlan.rides = Math.max(4, Math.round(workoutsPerWeek * 4)); // 4 недели
    
    // Корректируем другие показатели пропорционально
    if (weeklyRidesModifier < 1) {
      // Если тренировок меньше, снижаем интенсивность
      modifiedPlan.intervals = Math.max(2, Math.round(modifiedPlan.intervals * weeklyRidesModifier));
    }
  }
  
  return modifiedPlan;
}

/**
 * Получает план на основе профиля пользователя
 * @param {Object} userProfile - профиль пользователя
 * @returns {Object} - план тренировок
 */
function getPlanFromProfile(userProfile) {
  if (!userProfile) {
    return getTrainingPlan('intermediate', 5, 3);
  }
  
  const experienceLevel = userProfile.experience_level || 'intermediate';
  const timeAvailable = userProfile.time_available || 5;
  const workoutsPerWeek = userProfile.workouts_per_week || null;
  
  return getTrainingPlan(experienceLevel, timeAvailable, workoutsPerWeek);
}

module.exports = {
  getTrainingPlan,
  getPlanFromProfile,
  TRAINING_PLANS,
  TIME_MODIFIERS
};
