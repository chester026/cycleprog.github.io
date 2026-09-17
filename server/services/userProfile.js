// Business logic for the user-profile/onboarding domain (T-4.1 domain
// extraction). `getUserProfile`/`updateUserProfile`/`completeOnboarding`
// themselves stay in `../recommendations` (shared with training-plan
// routes) — this module only holds what's private to this domain:
// onboarding's default-goals seeding.
const { pool } = require('../db');
const logger = require('../lib/logger');

// Значения целей по уровню опыта, используемые при создании дефолтных целей.
const GOAL_VALUES_BY_EXPERIENCE = {
  beginner: {
    ftp_minutes: 60,
    hr_hills: 150,
    speed_flat: 25,
    distance: 200,
  },
  intermediate: {
    ftp_minutes: 120,
    hr_hills: 155,
    speed_flat: 30,
    distance: 400,
  },
  advanced: {
    ftp_minutes: 180,
    hr_hills: 160,
    speed_flat: 35,
    distance: 600,
  },
};

// Функция для создания дефолтных целей при завершении onboarding
async function createDefaultGoals(userId, experienceLevel = 'intermediate') {
  try {
    // Проверяем, есть ли уже цели у пользователя
    const existingGoals = await pool.query('SELECT COUNT(*) FROM goals WHERE user_id = $1', [userId]);
    if (parseInt(existingGoals.rows[0].count) > 0) {
      logger.debug(`User ${userId} already has goals, skipping default goals creation`);
      return;
    }

    // Определяем значения целей по уровню опыта
    const values = GOAL_VALUES_BY_EXPERIENCE[experienceLevel] || GOAL_VALUES_BY_EXPERIENCE.intermediate;

    // Создаем дефолтные цели
    const defaultGoals = [
      {
        title: 'FTP/VO₂max Workouts',
        goal_type: 'ftp_vo2max',
        target_value: values.ftp_minutes,
        unit: 'minutes',
        period: '4w',
      },
      {
        title: 'Average HR on Hills',
        goal_type: 'avg_hr_hills',
        target_value: values.hr_hills,
        unit: 'bpm',
        period: '4w',
      },
      {
        title: 'Average Speed on Flat',
        goal_type: 'speed_flat',
        target_value: values.speed_flat,
        unit: 'km/h',
        period: '4w',
      },
      {
        title: 'Distance',
        goal_type: 'distance',
        target_value: values.distance,
        unit: 'km',
        period: '4w',
      },
    ];

    // Вставляем цели в базу данных
    for (const goal of defaultGoals) {
      await pool.query(
        `INSERT INTO goals (user_id, title, goal_type, target_value, current_value, unit, period, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, $5, $6, NOW(), NOW())`,
        [userId, goal.title, goal.goal_type, goal.target_value, goal.unit, goal.period]
      );
    }

    logger.debug(`✅ Created ${defaultGoals.length} default goals for user ${userId} (${experienceLevel})`);
  } catch (error) {
    logger.error({ err: error }, '❌ Error creating default goals:');
    // Не бросаем ошибку, чтобы не прервать onboarding
  }
}

module.exports = {
  createDefaultGoals,
};
