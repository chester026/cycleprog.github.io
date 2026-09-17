// SQL for the training-plan domain (T-4.1). Extracted from
// recommendations/index.js's generatePersonalizedPlan/getPlanExecutionStats/
// getCustomTrainingPlan/saveCustomTrainingPlan/deleteCustomTraining — see
// services/training.js for the business logic that calls these, and
// routes/training.js for the HTTP layer. `getUserProfile` stays in
// ../recommendations (shared with the non-training onboarding/profile
// routes) — this file only owns the training-specific tables.
const { pool } = require('../db');

/** All goals for a user, most recent first (drives plan generation + stats). */
async function listGoals(userId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

/** The saved `generated_weekly_plans` row for this user/week, or null. */
async function getWeeklyPlan(userId, weekStartDate) {
  const result = await pool.query(
    'SELECT * FROM generated_weekly_plans WHERE user_id = $1 AND week_start_date = $2',
    [userId, weekStartDate]
  );
  return result.rows[0] || null;
}

/** Upserts the generated plan for this user/week (same shape as before, keyed on (user_id, week_start_date)). */
async function saveWeeklyPlan(userId, weekStartDate, { plan, analysis, priorities }, goalsHash) {
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
      weekStartDate,
      JSON.stringify(plan),
      JSON.stringify(analysis),
      JSON.stringify(priorities),
      goalsHash,
    ]
  );
}

/** Basic goal-completion stats (used by GET /api/training-plan/stats). */
async function getPlanExecutionStats(userId) {
  const result = await pool.query(
    'SELECT COUNT(*) as total_goals, AVG(current_value::numeric / target_value::numeric * 100) as avg_progress FROM goals WHERE user_id = $1',
    [userId]
  );

  return {
    totalGoals: parseInt(result.rows[0].total_goals) || 0,
    averageProgress: parseFloat(result.rows[0].avg_progress) || 0,
  };
}

/** Raw `custom_training_plans` rows for a user, ordered by day_key. */
async function listCustomTrainingRows(userId) {
  const result = await pool.query(
    'SELECT day_key, training_type, training_name, training_details, training_parts FROM custom_training_plans WHERE user_id = $1 ORDER BY day_key',
    [userId]
  );
  return result.rows;
}

async function upsertCompositeTraining(userId, dayKey, name, parts) {
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
    [userId, dayKey, 'composite', name, JSON.stringify(parts)]
  );
}

async function upsertRestTraining(userId, dayKey, name) {
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
    [userId, dayKey, 'rest', name]
  );
}

async function upsertSimpleTraining(userId, dayKey, type, name, details) {
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

async function deleteCustomTraining(userId, dayKey) {
  await pool.query(
    'DELETE FROM custom_training_plans WHERE user_id = $1 AND day_key = $2',
    [userId, dayKey]
  );
}

module.exports = {
  listGoals,
  getWeeklyPlan,
  saveWeeklyPlan,
  getPlanExecutionStats,
  listCustomTrainingRows,
  upsertCompositeTraining,
  upsertRestTraining,
  upsertSimpleTraining,
  deleteCustomTraining,
};
