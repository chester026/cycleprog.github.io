// SQL for goals + meta_goals (T-4.1 domain extraction). Moved verbatim from
// server.js — see routes/goals.js, routes/metaGoals.js and services/goals.js
// for the routes/logic that use these.
const { pool } = require('../db');

// --- goals ---------------------------------------------------------------

async function listGoals(userId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

/** All of a user's goals, ordered priority ASC then created_at DESC (used to group sub-goals under a meta-goal). */
async function listGoalsOrderedByPriority(userId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY priority ASC, created_at DESC',
    [userId]
  );
  return result.rows;
}

async function getGoal(userId, id) {
  const result = await pool.query('SELECT * FROM goals WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function metaGoalOwnedByUser(userId, metaGoalId) {
  const result = await pool.query('SELECT 1 FROM meta_goals WHERE id = $1 AND user_id = $2', [metaGoalId, userId]);
  return result.rows.length > 0;
}

async function insertGoal(userId, {
  title, description, target_value, current_value, unit, goal_type, period,
  hr_threshold, duration_threshold, vo2max_value, meta_goal_id,
}) {
  const result = await pool.query(
    'INSERT INTO goals (user_id, title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value, meta_goal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
    [userId, title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value, meta_goal_id]
  );
  return result.rows[0];
}

async function updateGoal(userId, id, {
  title, description, target_value, current_value, unit, goal_type, period,
  hr_threshold, duration_threshold, vo2max_value,
}) {
  const result = await pool.query(
    'UPDATE goals SET title = $1, description = $2, target_value = $3, current_value = $4, unit = $5, goal_type = $6, period = $7, hr_threshold = $8, duration_threshold = $9, vo2max_value = $10, updated_at = NOW() WHERE id = $11 AND user_id = $12 RETURNING *',
    [title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value, id, userId]
  );
  return result.rows[0] || null;
}

async function updateGoalVO2max(userId, id, vo2maxValue) {
  const result = await pool.query(
    'UPDATE goals SET vo2max_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
    [vo2maxValue, id, userId]
  );
  return result.rows[0] || null;
}

async function deleteGoal(userId, id) {
  const result = await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
  return result.rows[0] || null;
}

async function updateGoalCurrentValue(userId, id, currentValue) {
  const result = await pool.query(
    'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
    [currentValue, id, userId]
  );
  return result.rows[0] || null;
}

// --- meta_goals ------------------------------------------------------------

async function listMetaGoals(userId) {
  const result = await pool.query('SELECT * FROM meta_goals WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows;
}

async function getMetaGoal(userId, id) {
  const result = await pool.query('SELECT * FROM meta_goals WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function listSubGoals(userId, metaGoalId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE meta_goal_id = $1 AND user_id = $2 ORDER BY priority ASC, created_at DESC',
    [metaGoalId, userId]
  );
  return result.rows;
}

async function insertMetaGoal(userId, { title, description, target_date, ai_generated = false, ai_context = null }) {
  const result = await pool.query(
    `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING *`,
    [userId, title, description, target_date || null, ai_generated, ai_context]
  );
  return result.rows[0];
}

async function insertAiMetaGoal(userId, { title, description, target_date, ai_context, tier }) {
  const result = await pool.query(
    `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status, tier)
     VALUES ($1, $2, $3, $4, true, $5, 'active', $6)
     RETURNING *`,
    [userId, title, description, target_date || null, ai_context, tier]
  );
  return result.rows[0];
}

async function updateMetaGoal(userId, id, { title, description, target_date, status }) {
  const result = await pool.query(
    `UPDATE meta_goals
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         target_date = COALESCE($3, target_date),
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE id = $5 AND user_id = $6
     RETURNING *`,
    [title, description, target_date, status, id, userId]
  );
  return result.rows[0] || null;
}

async function deleteMetaGoal(userId, id) {
  const result = await pool.query('DELETE FROM meta_goals WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
  return result.rows[0] || null;
}

// --- AI generation helpers -------------------------------------------------

/** Existing active meta-goals + their sub-goals, fed into the AI prompt so it doesn't propose near-duplicates. */
async function getExistingActiveGoalsForAI(userId) {
  const result = await pool.query(
    `SELECT mg.id, mg.title, mg.focus_tags, mg.target_date,
            g.title AS sub_title, g.metric, g.target_value, g.unit
     FROM meta_goals mg
     LEFT JOIN goals g ON g.meta_goal_id = mg.id
     WHERE mg.user_id = $1 AND mg.status = 'active'
     ORDER BY mg.id`,
    [userId]
  );
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.id)) {
      map.set(row.id, { title: row.title, focus_tags: row.focus_tags || [], target_date: row.target_date, subGoals: [] });
    }
    if (row.sub_title) {
      map.get(row.id).subGoals.push({ title: row.sub_title, metric: row.metric, target_value: row.target_value, unit: row.unit });
    }
  }
  return Array.from(map.values());
}

async function insertAiFtpSubGoal(userId, metaGoalId, subGoal, { targetValue, vo2maxValue }) {
  const result = await pool.query(
    `INSERT INTO goals (
      user_id, meta_goal_id, title, description, target_value, current_value,
      unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value,
      priority, reasoning
    ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      userId,
      metaGoalId,
      subGoal.title,
      subGoal.description,
      targetValue,
      subGoal.unit,
      subGoal.goal_type,
      subGoal.period || '4w',
      subGoal.hr_threshold || 160,
      subGoal.duration_threshold || 120,
      vo2maxValue,
      subGoal.priority || 3,
      subGoal.reasoning || '',
    ]
  );
  return result.rows[0];
}

async function insertAiMetricSubGoal(userId, metaGoalId, subGoal, { targetValue }) {
  const result = await pool.query(
    `INSERT INTO goals (
      user_id, meta_goal_id, title, description, target_value, current_value,
      unit, goal_type, period, source, metric, start_date, end_date, priority, reasoning
    ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      userId,
      metaGoalId,
      subGoal.title,
      subGoal.description,
      targetValue || 0,
      subGoal.unit,
      subGoal.goal_type || null,
      subGoal.period || null,
      subGoal.metric?.source || null,
      subGoal.metric ? JSON.stringify(subGoal.metric) : null,
      subGoal.start_date || null,
      subGoal.end_date || null,
      subGoal.priority || 3,
      subGoal.reasoning || '',
    ]
  );
  return result.rows[0];
}

async function listSubGoalsByMetaGoalPriority(userId, metaGoalId) {
  const result = await pool.query(
    'SELECT * FROM goals WHERE meta_goal_id = $1 AND user_id = $2 ORDER BY priority ASC',
    [metaGoalId, userId]
  );
  return result.rows;
}

module.exports = {
  listGoals,
  listGoalsOrderedByPriority,
  getGoal,
  metaGoalOwnedByUser,
  insertGoal,
  updateGoal,
  updateGoalVO2max,
  deleteGoal,
  updateGoalCurrentValue,
  listMetaGoals,
  getMetaGoal,
  listSubGoals,
  insertMetaGoal,
  insertAiMetaGoal,
  updateMetaGoal,
  deleteMetaGoal,
  getExistingActiveGoalsForAI,
  insertAiFtpSubGoal,
  insertAiMetricSubGoal,
  listSubGoalsByMetaGoalPriority,
};
