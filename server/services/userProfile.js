// Business logic for the user-profile/onboarding domain (T-4.1 domain
// extraction). `getUserProfile`/`updateUserProfile`/`completeOnboarding`
// themselves stay in `../recommendations` (shared with training-plan
// routes) — this module holds onboarding's default-goals seeding, plus
// (coach-memory work) the field validation shared by PUT /api/user-profile,
// POST /api/user-profile/onboarding and the coach's update_rider_profile
// tool (aiCoach.js) — one set of range rules, so the tool can never accept
// something the HTTP route would reject.
const { pool } = require('../db');
const logger = require('../lib/logger');
const { ApiError } = require('../lib/apiError');
const { ageFromBirthDate } = require('@bikelab/shared/calc');

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];

function badField(message) {
  return new ApiError(400, 'VALIDATION_ERROR', message);
}

// Validates whichever of these fields are present in `fields` (all
// optional — callers pass a partial object). Throws on the first invalid
// one. `!= null` (not truthiness) is deliberate: a field explicitly sent as
// 0 (e.g. height: 0) is out of every range below anyway, so this only
// changes behaviour for callers that used to silently accept it.
function validateProfileFields(fields) {
  if (fields.experience_level != null && !EXPERIENCE_LEVELS.includes(fields.experience_level)) {
    throw badField('Invalid experience level');
  }
  if (fields.height != null && (fields.height < 100 || fields.height > 250)) {
    throw badField('Height must be between 100 and 250 cm');
  }
  if (fields.weight != null && (fields.weight < 30 || fields.weight > 200)) {
    throw badField('Weight must be between 30 and 200 kg');
  }
  if (fields.age != null && (fields.age < 10 || fields.age > 100)) {
    throw badField('Age must be between 10 and 100 years');
  }
  // birth_date is validated by what it DERIVES to, not its own bounds — a
  // syntactically fine date can still be a birthday with an implausible
  // age (age < 10 or > 100), which ageFromBirthDate also flags by way of
  // returning null for anything that doesn't parse as a real calendar date.
  if (fields.birth_date != null) {
    const derivedAge = ageFromBirthDate(fields.birth_date);
    if (derivedAge === null) {
      throw badField('birth_date must be a valid date (YYYY-MM-DD)');
    }
    if (derivedAge < 10 || derivedAge > 100) {
      throw badField('Age must be between 10 and 100 years');
    }
  }
  if (fields.bike_weight != null && (fields.bike_weight < 5 || fields.bike_weight > 25)) {
    throw badField('Bike weight must be between 5 and 25 kg');
  }
  if (fields.max_hr != null && (fields.max_hr < 100 || fields.max_hr > 220)) {
    throw badField('Max HR must be between 100 and 220 bpm');
  }
  if (fields.resting_hr != null && (fields.resting_hr < 40 || fields.resting_hr > 100)) {
    throw badField('Resting HR must be between 40 and 100 bpm');
  }
  if (fields.lactate_threshold != null && (fields.lactate_threshold < 120 || fields.lactate_threshold > 200)) {
    throw badField('Lactate Threshold must be between 120 and 200 bpm');
  }
}

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
  validateProfileFields,
};
