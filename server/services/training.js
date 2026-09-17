// Business logic for the training-plan domain (T-4.1) — extracted from
// recommendations/index.js's generatePersonalizedPlan/getCustomTrainingPlan/
// saveCustomTrainingPlan/deleteCustomTraining/getTrainingTypeDetails/
// getAllTrainingTypes. SQL lives in repositories/training.js;
// `generateWeeklyPlan`/`getTrainingTypeInfo` (the weekly-plan generator +
// training-type catalog) still live in recommendations/training-utils —
// that module is also used by non-training recommendations (goal-specific
// advice), so it stays put and is required from here instead of duplicated.
// `getUserProfile` likewise stays in ../recommendations (shared with the
// profile/onboarding routes).
const logger = require('../lib/logger');
const { pool } = require('../db');
const trainingRepo = require('../repositories/training');
const { getUserProfile } = require('../recommendations');
const { generateWeeklyPlan, getTrainingTypeInfo } = require('../recommendations/training-utils');
const fs = require('fs');
const path = require('path');

/** Monday of the current week (local time), same as recommendations/index.js's getWeekStart. */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/** Stable hash of the goals + profile fields that affect plan generation, used to decide whether to regenerate. */
function createGoalsHash(goals, userProfile) {
  const crypto = require('crypto');
  const goalsData = goals.map((g) => ({
    id: g.id,
    goal_type: g.goal_type,
    target_value: g.target_value,
    current_value: g.current_value,
    period: g.period,
  }));

  const profileData = {
    experience_level: userProfile.experience_level,
    workouts_per_week: userProfile.workouts_per_week,
    preferred_days: userProfile.preferred_days,
    preferred_training_types: userProfile.preferred_training_types,
  };

  const combinedData = JSON.stringify({ goals: goalsData, profile: profileData });
  return crypto.createHash('sha256').update(combinedData).digest('hex');
}

/** Rotates training priorities across weeks (3-way rotation keyed on week number). */
function addWeeklyVariation(weekStartDate) {
  const weekNumber = Math.floor((weekStartDate - new Date(weekStartDate.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  return weekNumber % 3;
}

/**
 * Shapes the raw `custom_training_plans` rows into the `{[dayKey]: {...}}`
 * map the client expects. Never throws — mirrors recommendations/index.js's
 * original getCustomTrainingPlan, which swallowed DB errors and returned `{}`.
 */
async function getCustomTrainingPlan(userId) {
  try {
    const rows = await trainingRepo.listCustomTrainingRows(userId);

    const customPlan = {};
    rows.forEach((row) => {
      if (row.training_type === 'composite' && row.training_parts) {
        customPlan[row.day_key] = {
          type: 'composite',
          name: `${row.training_parts.length} частей`,
          parts: row.training_parts,
        };
      } else if (row.training_type === 'rest') {
        customPlan[row.day_key] = {
          type: 'rest',
          name: 'Отдых',
          description: 'День отдыха',
        };
      } else {
        customPlan[row.day_key] = {
          type: row.training_type || 'simple',
          name: row.training_name,
          details: row.training_details,
        };
      }
    });

    return customPlan;
  } catch (error) {
    logger.error({ err: error }, 'Error getting custom training plan:');
    return {};
  }
}

/** Generates (or reuses this week's cached) personalized training plan for a user. */
async function generatePersonalizedPlan(userId) {
  try {
    const goals = await trainingRepo.listGoals(userId);
    const userProfile = await getUserProfile(pool, userId);

    const hasGoals = goals.length > 0;

    const weekStart = getWeekStart();
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const currentGoalsHash = createGoalsHash(goals, userProfile);

    const existingPlan = await trainingRepo.getWeeklyPlan(userId, weekStartStr);

    let weeklyPlan;
    let shouldRegeneratePlan = true;

    if (existingPlan && existingPlan.goals_hash === currentGoalsHash) {
      shouldRegeneratePlan = false;
      weeklyPlan = {
        plan: existingPlan.plan_data,
        analysis: existingPlan.analysis_data,
        priorities: existingPlan.priorities_data,
      };
    }

    if (shouldRegeneratePlan) {
      const weekVariation = addWeeklyVariation(weekStart);
      weeklyPlan = generateWeeklyPlan(goals, userProfile, weekVariation);
      await trainingRepo.saveWeeklyPlan(userId, weekStartStr, weeklyPlan, currentGoalsHash);
    }

    const customPlan = await getCustomTrainingPlan(userId);

    return {
      plan: weeklyPlan.plan,
      analysis: weeklyPlan.analysis,
      priorities: weeklyPlan.priorities,
      userProfile,
      customPlan,
      weekStartDate: weekStartStr,
      isFallbackPlan: !hasGoals,
      fallbackMessage: !hasGoals
        ? `Basic training plan based on your ${userProfile.experience_level} level. Create goals for personalized recommendations!`
        : null,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating personalized plan:');
    throw error;
  }
}

/** Saves (or deletes, when `training` is null) the custom training for one day. */
async function saveCustomTrainingPlan(userId, dayKey, training) {
  try {
    if (training === null) {
      await trainingRepo.deleteCustomTraining(userId, dayKey);
      return { success: true };
    }

    const { type, name, details, parts } = training;

    if (type === 'composite' && parts) {
      await trainingRepo.upsertCompositeTraining(userId, dayKey, name, parts);
    } else if (type === 'rest') {
      await trainingRepo.upsertRestTraining(userId, dayKey, name);
    } else {
      await trainingRepo.upsertSimpleTraining(userId, dayKey, type, name, details);
    }

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error saving custom training plan:');
    throw error;
  }
}

/** Deletes the custom training for one day (a no-op if none existed). */
async function deleteCustomTraining(userId, dayKey) {
  try {
    await trainingRepo.deleteCustomTraining(userId, dayKey);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error deleting custom training:');
    throw error;
  }
}

/** Details for one training type, or null/undefined if unknown (see recommendations/training-utils's getTrainingTypeInfo). */
function getTrainingTypeDetails(trainingType) {
  return getTrainingTypeInfo(trainingType);
}

/** All available training types, keyed list shape (`{key, ...details}[]`). */
function getAllTrainingTypes() {
  const trainingTypes = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../recommendations/training-types.json'), 'utf8')
  );

  return Object.keys(trainingTypes.training_types).map((type) => ({
    key: type,
    ...trainingTypes.training_types[type],
  }));
}

async function getPlanExecutionStats(userId) {
  try {
    return await trainingRepo.getPlanExecutionStats(userId);
  } catch (error) {
    logger.error({ err: error }, 'Error getting plan execution stats:');
    return {
      totalGoals: 0,
      averageProgress: 0,
    };
  }
}

module.exports = {
  generatePersonalizedPlan,
  getTrainingTypeDetails,
  getAllTrainingTypes,
  getPlanExecutionStats,
  getCustomTrainingPlan,
  saveCustomTrainingPlan,
  deleteCustomTraining,
};
