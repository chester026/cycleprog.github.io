const { generateWeeklyPlan, getGoalRecommendations, getTrainingTypeInfo } = require('./training-utils');

/**
 * Получает профиль пользователя из базы данных
 */
async function getUserProfile(pool, userId) {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }
    
    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Создаем профиль по умолчанию
      const defaultProfile = {
        experience_level: 'intermediate',
        time_available: 5,
        workouts_per_week: 5,
        show_recommendations: false,
        preferred_training_types: ['endurance', 'tempo', 'intervals'],
        preferred_days: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
        seasonal_preferences: {},
        gender: null
      };
      
      const insertResult = await pool.query(
        'INSERT INTO user_profiles (user_id, experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, seasonal_preferences, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [userId, defaultProfile.experience_level, defaultProfile.time_available, defaultProfile.workouts_per_week, defaultProfile.show_recommendations, defaultProfile.preferred_training_types, defaultProfile.preferred_days, JSON.stringify(defaultProfile.seasonal_preferences), defaultProfile.gender]
      );
      
      return insertResult.rows[0];
    }
    
    const profile = result.rows[0];
    
    // Parse JSON fields if they are strings
    let preferred_training_types = profile.preferred_training_types;
    let preferred_days = profile.preferred_days;
    let seasonal_preferences = profile.seasonal_preferences;
    
    if (typeof preferred_training_types === 'string') {
      try { preferred_training_types = JSON.parse(preferred_training_types); } catch (e) { preferred_training_types = []; }
    }
    if (typeof preferred_days === 'string') {
      try { preferred_days = JSON.parse(preferred_days); } catch (e) { preferred_days = ['monday', 'tuesday', 'wednesday', 'friday', 'saturday']; }
    }
    if (typeof seasonal_preferences === 'string') {
      try { seasonal_preferences = JSON.parse(seasonal_preferences); } catch (e) { seasonal_preferences = {}; }
    }
    
    return {
      experience_level: profile.experience_level,
      time_available: profile.time_available,
      workouts_per_week: profile.workouts_per_week || 5,
      show_recommendations: profile.show_recommendations || false,
      preferred_training_types: preferred_training_types || [],
      preferred_days: preferred_days || ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
      seasonal_preferences: seasonal_preferences || {},
      height: profile.height,
      weight: profile.weight,
      age: profile.age,
      bike_weight: profile.bike_weight,
      hr_zones: profile.hr_zones,
      max_hr: profile.max_hr,
      resting_hr: profile.resting_hr,
      lactate_threshold: profile.lactate_threshold,
      gender: profile.gender,
      onboarding_completed: profile.onboarding_completed || false
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    // Возвращаем профиль по умолчанию в случае ошибки
    return {
      experience_level: 'intermediate',
      time_available: 5,
      workouts_per_week: 5,
      show_recommendations: false,
      preferred_training_types: ['endurance', 'tempo', 'intervals'],
      seasonal_preferences: {},
      gender: null
    };
  }
}

/**
 * Обновляет профиль пользователя
 */
async function updateUserProfile(pool, userId, profileData) {
  try {
    // First get current profile to preserve existing data
    const currentProfile = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    
    const existing = currentProfile.rows[0] || {};
    
    const { 
      experience_level, 
      time_available, 
      workouts_per_week, 
      show_recommendations, 
      preferred_training_types, 
      preferred_days, 
      seasonal_preferences,
      height,
      weight,
      age,
      bike_weight,
      hr_zones,
      max_hr,
      resting_hr,
      lactate_threshold,
      gender,
      onboarding_completed
    } = profileData;
    
    // Merge with existing data, only update provided fields
    const mergedData = {
      experience_level: experience_level !== undefined ? experience_level : existing.experience_level,
      time_available: time_available !== undefined ? time_available : existing.time_available,
      workouts_per_week: workouts_per_week !== undefined ? workouts_per_week : existing.workouts_per_week,
      show_recommendations: show_recommendations !== undefined ? show_recommendations : existing.show_recommendations,
      preferred_training_types: preferred_training_types !== undefined ? preferred_training_types : existing.preferred_training_types,
      preferred_days: preferred_days !== undefined ? preferred_days : existing.preferred_days,
      seasonal_preferences: seasonal_preferences !== undefined ? seasonal_preferences : existing.seasonal_preferences,
      height: height !== undefined ? height : existing.height,
      weight: weight !== undefined ? weight : existing.weight,
      age: age !== undefined ? age : existing.age,
      bike_weight: bike_weight !== undefined ? bike_weight : existing.bike_weight,
      hr_zones: hr_zones !== undefined ? hr_zones : existing.hr_zones,
      max_hr: max_hr !== undefined ? max_hr : existing.max_hr,
      resting_hr: resting_hr !== undefined ? resting_hr : existing.resting_hr,
      lactate_threshold: lactate_threshold !== undefined ? lactate_threshold : existing.lactate_threshold,
      gender: gender !== undefined ? gender : existing.gender,
      onboarding_completed: onboarding_completed !== undefined ? onboarding_completed : existing.onboarding_completed
    };
    
    const result = await pool.query(
      `INSERT INTO user_profiles (user_id, experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, seasonal_preferences, height, weight, age, bike_weight, hr_zones, max_hr, resting_hr, lactate_threshold, gender, onboarding_completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         experience_level = EXCLUDED.experience_level,
         time_available = EXCLUDED.time_available,
         workouts_per_week = EXCLUDED.workouts_per_week,
         show_recommendations = EXCLUDED.show_recommendations,
         preferred_training_types = EXCLUDED.preferred_training_types,
         preferred_days = EXCLUDED.preferred_days,
         seasonal_preferences = EXCLUDED.seasonal_preferences,
         height = EXCLUDED.height,
         weight = EXCLUDED.weight,
         age = EXCLUDED.age,
         bike_weight = EXCLUDED.bike_weight,
         hr_zones = EXCLUDED.hr_zones,
         max_hr = EXCLUDED.max_hr,
         resting_hr = EXCLUDED.resting_hr,
         lactate_threshold = EXCLUDED.lactate_threshold,
         gender = EXCLUDED.gender,
         onboarding_completed = EXCLUDED.onboarding_completed,
         updated_at = NOW()
       RETURNING *`,
      [
        userId, 
        mergedData.experience_level, 
        mergedData.time_available, 
        mergedData.workouts_per_week, 
        mergedData.show_recommendations, 
        mergedData.preferred_training_types, 
        mergedData.preferred_days, 
        JSON.stringify(mergedData.seasonal_preferences), 
        mergedData.height, 
        mergedData.weight, 
        mergedData.age, 
        mergedData.bike_weight, 
        mergedData.hr_zones, 
        mergedData.max_hr,
        mergedData.resting_hr,
        mergedData.lactate_threshold,
        mergedData.gender,
        mergedData.onboarding_completed
      ]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    throw error;
  }
}

/**
 * Получает понедельник текущей недели
 */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Создает хеш для целей пользователя
 */
function createGoalsHash(goals, userProfile) {
  const crypto = require('crypto');
  const goalsData = goals.map(g => ({
    id: g.id,
    goal_type: g.goal_type,
    target_value: g.target_value,
    current_value: g.current_value,
    period: g.period
  }));
  
  const profileData = {
    experience_level: userProfile.experience_level,
    workouts_per_week: userProfile.workouts_per_week,
    preferred_days: userProfile.preferred_days,
    preferred_training_types: userProfile.preferred_training_types
  };
  
  const combinedData = JSON.stringify({ goals: goalsData, profile: profileData });
  return crypto.createHash('sha256').update(combinedData).digest('hex');
}

/**
 * Добавляет разнообразие в генерацию плана на основе номера недели
 */
function addWeeklyVariation(weekStartDate) {
  // Используем номер недели года как seed для разнообразия
  const weekNumber = Math.floor((weekStartDate - new Date(weekStartDate.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  return weekNumber % 3; // Создаем 3 варианта ротации
}

/**
 * Генерирует персонализированный план тренировок
 */
async function generatePersonalizedPlan(pool, userId) {
  try {
    // Получаем цели пользователя
    const goalsResult = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    if (goalsResult.rows.length === 0) {
      return {
        plan: null,
        analysis: [],
        priorities: [],
        message: 'У вас пока нет целей. Создайте цели для получения персонализированных рекомендаций.'
      };
    }
    
    // Получаем профиль пользователя
    const userProfile = await getUserProfile(pool, userId);
    
    // Определяем начало текущей недели (понедельник)
    const weekStart = getWeekStart();
    const weekStartStr = weekStart.toISOString().split('T')[0];
    
    // Создаем хеш текущих целей и профиля
    const currentGoalsHash = createGoalsHash(goalsResult.rows, userProfile);
    
    // Проверяем есть ли актуальный план для текущей недели
    const existingPlanResult = await pool.query(
      'SELECT * FROM generated_weekly_plans WHERE user_id = $1 AND week_start_date = $2',
      [userId, weekStartStr]
    );
    
    let weeklyPlan;
    let shouldRegeneratePlan = true;
    
    if (existingPlanResult.rows.length > 0) {
      const existingPlan = existingPlanResult.rows[0];
      
      // Проверяем изменились ли цели или профиль
      if (existingPlan.goals_hash === currentGoalsHash) {
        // План актуален - используем сохраненный
        shouldRegeneratePlan = false;
        weeklyPlan = {
          plan: existingPlan.plan_data,
          analysis: existingPlan.analysis_data,
          priorities: existingPlan.priorities_data
        };

      }
    }
    
    if (shouldRegeneratePlan) {
      // Добавляем разнообразие на основе номера недели
      const weekVariation = addWeeklyVariation(weekStart);
      
      // Генерируем новый план с учетом вариации
      weeklyPlan = generateWeeklyPlan(goalsResult.rows, userProfile, weekVariation);
      
      // Сохраняем новый план в базу
      await pool.query(
        `INSERT INTO generated_weekly_plans (user_id, week_start_date, plan_data, analysis_data, priorities_data, goals_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, week_start_date) 
         DO UPDATE SET 
           plan_data = EXCLUDED.plan_data,
           analysis_data = EXCLUDED.analysis_data,
           priorities_data = EXCLUDED.priorities_data,
           goals_hash = EXCLUDED.goals_hash,
           updated_at = NOW()`,
        [
          userId, 
          weekStartStr, 
          JSON.stringify(weeklyPlan.plan),
          JSON.stringify(weeklyPlan.analysis),
          JSON.stringify(weeklyPlan.priorities),
          currentGoalsHash
        ]
      );
      

    }
    
    // Получаем кастомный план пользователя
    const customPlan = await getCustomTrainingPlan(pool, userId);
    

    
    // Возвращаем сгенерированный план и кастомный план отдельно
    return {
      plan: weeklyPlan.plan,
      analysis: weeklyPlan.analysis,
      priorities: weeklyPlan.priorities,
      userProfile,
      customPlan,
      weekStartDate: weekStartStr
    };
  } catch (error) {
    console.error('Error generating personalized plan:', error);
    throw error;
  }
}

/**
 * Получает рекомендации для конкретной цели
 */
async function getGoalSpecificRecommendations(pool, userId, goalId) {
  try {
    // Получаем цель
    const goalResult = await pool.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );
    
    if (goalResult.rows.length === 0) {
      throw new Error('Goal not found');
    }
    
    const goal = goalResult.rows[0];
    const recommendations = getGoalRecommendations(goal.goal_type);
    
    if (!recommendations) {
      return {
        goal,
        recommendations: null,
        message: 'Рекомендации для данного типа цели не найдены'
      };
    }
    
    return {
      goal,
      recommendations
    };
  } catch (error) {
    console.error('Error getting goal recommendations:', error);
    throw error;
  }
}

/**
 * Получает информацию о типе тренировки
 */
function getTrainingTypeDetails(trainingType) {
  return getTrainingTypeInfo(trainingType);
}

/**
 * Получает все доступные типы тренировок
 */
function getAllTrainingTypes() {
  const fs = require('fs');
  const path = require('path');
  const trainingTypes = JSON.parse(fs.readFileSync(path.join(__dirname, 'training-types.json'), 'utf8'));
  
  return Object.keys(trainingTypes.training_types).map(type => ({
    key: type,
    ...trainingTypes.training_types[type]
  }));
}

/**
 * Получает статистику выполнения планов (для будущего использования)
 */
async function getPlanExecutionStats(pool, userId) {
  try {
    // Здесь можно добавить логику для отслеживания выполнения планов
    // Пока возвращаем базовую статистику
    const result = await pool.query(
      'SELECT COUNT(*) as total_goals, AVG(current_value::numeric / target_value::numeric * 100) as avg_progress FROM goals WHERE user_id = $1',
      [userId]
    );
    
    return {
      totalGoals: parseInt(result.rows[0].total_goals) || 0,
      averageProgress: parseFloat(result.rows[0].avg_progress) || 0
    };
  } catch (error) {
    console.error('Error getting plan execution stats:', error);
    return {
      totalGoals: 0,
      averageProgress: 0
    };
  }
}

/**
 * Получает кастомный план тренировок пользователя
 */
async function getCustomTrainingPlan(pool, userId) {
  try {
    const result = await pool.query(
      'SELECT day_key, training_type, training_name, training_details, training_parts FROM custom_training_plans WHERE user_id = $1 ORDER BY day_key',
      [userId]
    );
    

    
    const customPlan = {};
    result.rows.forEach(row => {
      if (row.training_type === 'composite' && row.training_parts) {
        // Составная тренировка
        customPlan[row.day_key] = {
          type: 'composite',
          name: `${row.training_parts.length} частей`,
          parts: row.training_parts
        };
      } else if (row.training_type === 'rest') {
        // День отдыха
        customPlan[row.day_key] = {
          type: 'rest',
          name: 'Отдых',
          description: 'День отдыха'
        };
      } else {
        // Простая тренировка
        customPlan[row.day_key] = {
          type: row.training_type || 'simple',
          name: row.training_name,
          details: row.training_details
        };
      }
    });
    
    return customPlan;
  } catch (error) {
    console.error('Error getting custom training plan:', error);
    return {};
  }
}

/**
 * Сохраняет кастомный план тренировок пользователя
 */
async function saveCustomTrainingPlan(pool, userId, dayKey, training) {
  try {

    
    if (training === null) {
      // Удаляем тренировку
      await pool.query(
        'DELETE FROM custom_training_plans WHERE user_id = $1 AND day_key = $2',
        [userId, dayKey]
      );
      return { success: true };
    }

    const { type, name, details, parts } = training;
    
    if (type === 'composite' && parts) {
      // Составная тренировка
      await pool.query(
        `INSERT INTO custom_training_plans (user_id, day_key, training_type, training_name, training_parts)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, day_key) 
         DO UPDATE SET 
           training_type = EXCLUDED.training_type,
           training_name = EXCLUDED.training_name,
           training_parts = EXCLUDED.training_parts,
           training_details = NULL,
           updated_at = NOW()`,
        [userId, dayKey, type, name, JSON.stringify(parts)]
      );
    } else if (type === 'rest') {
      // День отдыха
      await pool.query(
        `INSERT INTO custom_training_plans (user_id, day_key, training_type, training_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day_key) 
         DO UPDATE SET 
           training_type = EXCLUDED.training_type,
           training_name = EXCLUDED.training_name,
           training_details = NULL,
           training_parts = NULL,
           updated_at = NOW()`,
        [userId, dayKey, type, name]
      );
    } else {
      // Простая тренировка
      await pool.query(
        `INSERT INTO custom_training_plans (user_id, day_key, training_type, training_name, training_details)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, day_key) 
         DO UPDATE SET 
           training_type = EXCLUDED.training_type,
           training_name = EXCLUDED.training_name,
           training_details = EXCLUDED.training_details,
           training_parts = NULL,
           updated_at = NOW()`,
        [userId, dayKey, type, name, JSON.stringify(details)]
      );
    }
    

    return { success: true };
  } catch (error) {
    console.error('Error saving custom training plan:', error);
    throw error;
  }
}

/**
 * Удаляет кастомную тренировку для конкретного дня
 */
async function deleteCustomTraining(pool, userId, dayKey) {
  try {
    await pool.query(
      'DELETE FROM custom_training_plans WHERE user_id = $1 AND day_key = $2',
      [userId, dayKey]
    );
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting custom training:', error);
    throw error;
  }
}

/**
 * Завершает онбоардинг пользователя
 */
async function completeOnboarding(pool, userId, onboardingData) {
  try {
    
    const { height, weight, age, bike_weight, experience_level, gender, hr_zones, max_hr, resting_hr, lactate_threshold, onboarding_completed } = onboardingData;
    
    // If only onboarding_completed is provided (skip case), just update that
    if (onboarding_completed && Object.keys(onboardingData).length === 1) {
      const result = await pool.query(
        `UPDATE user_profiles 
         SET onboarding_completed = TRUE, updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [userId]
      );
      return result.rows[0];
    }
    
    // Otherwise, update all provided fields
    
    // Convert string values to appropriate types
    const heightNum = height ? parseInt(height) : null;
    const weightNum = weight ? parseFloat(weight) : null;
    const ageNum = age ? parseInt(age) : null;
    const bikeWeightNum = bike_weight ? parseFloat(bike_weight) : null;
    const maxHrNum = max_hr ? parseInt(max_hr) : null;
    const restingHrNum = resting_hr ? parseInt(resting_hr) : null;
    const lactateThresholdNum = lactate_threshold ? parseInt(lactate_threshold) : null;
    
    // First get current profile to preserve existing data
    const currentProfile = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    
    const existing = currentProfile.rows[0] || {};
    
    // Handle JSON fields properly
    let preferredDays = existing.preferred_days;
    let preferredTrainingTypes = existing.preferred_training_types;
    let seasonalPreferences = existing.seasonal_preferences;
    
    // Convert to PostgreSQL array format or JSON string
    if (Array.isArray(preferredDays)) {
      preferredDays = `{${preferredDays.map(day => `"${day}"`).join(',')}}`;
    } else if (typeof preferredDays === 'string') {
      try {
        const parsed = JSON.parse(preferredDays);
        if (Array.isArray(parsed)) {
          preferredDays = `{${parsed.map(day => `"${day}"`).join(',')}}`;
        }
      } catch (e) {
        // If it's not valid JSON, use default
        preferredDays = '{"monday","tuesday","wednesday","friday","saturday"}';
      }
    } else {
      preferredDays = '{"monday","tuesday","wednesday","friday","saturday"}';
    }
    
    if (Array.isArray(preferredTrainingTypes)) {
      preferredTrainingTypes = `{${preferredTrainingTypes.map(type => `"${type}"`).join(',')}}`;
    } else if (typeof preferredTrainingTypes === 'string') {
      try {
        const parsed = JSON.parse(preferredTrainingTypes);
        if (Array.isArray(parsed)) {
          preferredTrainingTypes = `{${parsed.map(type => `"${type}"`).join(',')}}`;
        }
      } catch (e) {
        preferredTrainingTypes = '{}';
      }
    } else {
      preferredTrainingTypes = '{}';
    }
    
    if (typeof seasonalPreferences === 'string') {
      // Keep as JSON string for object
      try {
        JSON.parse(seasonalPreferences);
      } catch (e) {
        seasonalPreferences = '{}';
      }
    } else {
      seasonalPreferences = JSON.stringify(seasonalPreferences || {});
    }
    
    // Update only the provided fields, keeping existing data
    const result = await pool.query(
      `UPDATE user_profiles 
       SET 
         height = $1,
         weight = $2,
         age = $3,
         bike_weight = $4,
         experience_level = $5,
         gender = $6,
         workouts_per_week = $7,
         show_recommendations = $8,
         preferred_days = $9,
         preferred_training_types = $10,
         seasonal_preferences = $11,
         hr_zones = COALESCE($12, hr_zones),
         max_hr = COALESCE($13, max_hr),
         resting_hr = COALESCE($14, resting_hr),
         lactate_threshold = COALESCE($15, lactate_threshold),
         onboarding_completed = TRUE,
         updated_at = NOW()
       WHERE user_id = $16
       RETURNING *`,
      [
        heightNum, 
        weightNum, 
        ageNum, 
        bikeWeightNum, 
        experience_level,
        gender,
        existing.workouts_per_week || 5,
        existing.show_recommendations !== null ? existing.show_recommendations : true,
        preferredDays,
        preferredTrainingTypes,
        seasonalPreferences,
        hr_zones,
        maxHrNum,
        restingHrNum,
        lactateThresholdNum,
        userId
      ]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error completing onboarding:', error);
    throw error;
  }
}

module.exports = {
  getUserProfile,
  updateUserProfile,
  generatePersonalizedPlan,
  getGoalSpecificRecommendations,
  getTrainingTypeDetails,
  getAllTrainingTypes,
  getPlanExecutionStats,
  getCustomTrainingPlan,
  saveCustomTrainingPlan,
  deleteCustomTraining,
  completeOnboarding
}; 