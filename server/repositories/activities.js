// SQL for per-activity meta-goals progress (T-4.1 domain extraction). Moved
// verbatim from server.js — see services/activities.js and
// routes/activities.js for the logic/routes that use these.
const { pool } = require('../db');

async function getCachedProgress(userId, activityId) {
  const result = await pool.query(
    `SELECT meta_goal_id, activity_id, progress_before, progress_after, contributions
       FROM activity_meta_goals_progress
      WHERE user_id = $1 AND activity_id = $2`,
    [userId, activityId]
  );
  return result.rows;
}

async function getMetaGoalsByIds(metaGoalIds, userId) {
  const result = await pool.query(
    'SELECT id, title, status FROM meta_goals WHERE id = ANY($1) AND user_id = $2',
    [metaGoalIds, userId]
  );
  return result.rows;
}

async function getActiveMetaGoals(userId) {
  const result = await pool.query(
    'SELECT * FROM meta_goals WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );
  return result.rows;
}

async function getPreviousProgress(userId) {
  const result = await pool.query(
    'SELECT meta_goal_id, progress_after FROM activity_meta_goals_progress WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

async function getSubGoalsForMetaGoals(metaGoalIds) {
  if (metaGoalIds.length === 0) return [];
  const result = await pool.query(
    'SELECT * FROM goals WHERE meta_goal_id = ANY($1::int[]) AND goal_type != $2',
    [metaGoalIds, 'ftp_vo2max']
  );
  return result.rows;
}

async function upsertProgress(activityId, metaGoalId, userId, progressBefore, progressAfter, contributions) {
  await pool.query(
    `INSERT INTO activity_meta_goals_progress
       (activity_id, meta_goal_id, user_id, progress_before, progress_after, contributions)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (meta_goal_id, user_id)
     DO UPDATE SET
       activity_id = $1,
       progress_before = $4,
       progress_after = $5,
       contributions = $6,
       created_at = NOW()`,
    [activityId, metaGoalId, userId, progressBefore, progressAfter, JSON.stringify(contributions)]
  );
}

module.exports = {
  getCachedProgress,
  getMetaGoalsByIds,
  getActiveMetaGoals,
  getPreviousProgress,
  getSubGoalsForMetaGoals,
  upsertProgress,
};
