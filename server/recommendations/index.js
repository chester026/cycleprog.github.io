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
        seasonal_preferences: {}
      };
      
      await pool.query(
        'INSERT INTO user_profiles (user_id, experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, seasonal_preferences) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [userId, defaultProfile.experience_level, defaultProfile.time_available, defaultProfile.workouts_per_week, defaultProfile.show_recommendations, defaultProfile.preferred_training_types, defaultProfile.preferred_days, JSON.stringify(defaultProfile.seasonal_preferences)]
      );
      
      return defaultProfile;
    }
    
    const profile = result.rows[0];
    return {
      experience_level: profile.experience_level,
      time_available: profile.time_available,
      workouts_per_week: profile.workouts_per_week || 5,
      show_recommendations: profile.show_recommendations || false,
      preferred_training_types: profile.preferred_training_types || [],
      preferred_days: profile.preferred_days || ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
      seasonal_preferences: profile.seasonal_preferences || {}
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
      seasonal_preferences: {}
    };
  }
}

/**
 * Обновляет профиль пользователя
 */
async function updateUserProfile(pool, userId, profileData) {
  try {
    const { experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, seasonal_preferences } = profileData;
    
    const result = await pool.query(
      `INSERT INTO user_profiles (user_id, experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, seasonal_preferences, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         experience_level = EXCLUDED.experience_level,
         time_available = EXCLUDED.time_available,
         workouts_per_week = EXCLUDED.workouts_per_week,
         show_recommendations = EXCLUDED.show_recommendations,
         preferred_training_types = EXCLUDED.preferred_training_types,
         preferred_days = EXCLUDED.preferred_days,
         seasonal_preferences = EXCLUDED.seasonal_preferences,
         updated_at = NOW()
       RETURNING *`,
      [userId, experience_level, time_available, workouts_per_week, show_recommendations, preferred_training_types, preferred_days, JSON.stringify(seasonal_preferences)]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
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
    
    // Получаем кастомный план пользователя
    const customPlan = await getCustomTrainingPlan(pool, userId);
    
    // Генерируем план
    const weeklyPlan = generateWeeklyPlan(goalsResult.rows, userProfile);
    
    // Возвращаем сгенерированный план и кастомный план отдельно
    return {
      plan: weeklyPlan.plan,
      analysis: weeklyPlan.analysis,
      priorities: weeklyPlan.priorities,
      userProfile,
      customPlan
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
  deleteCustomTraining
}; 