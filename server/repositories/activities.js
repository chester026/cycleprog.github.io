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
    'SELECT id, title, status, tier FROM meta_goals WHERE id = ANY($1) AND user_id = $2',
    [metaGoalIds, userId]
  );
  return result.rows;
}

// "Active" = not finished. Production rows predate the status enum
// (`active`/`completed`) and carry NULL or legacy values, so a strict
// `status = 'active'` silently excluded every meta goal for some users and
// Impact on Goals showed "No active goals found".
const FINISHED_STATUSES = ['completed', 'archived', 'cancelled', 'deleted'];

async function getActiveMetaGoals(userId) {
  const result = await pool.query(
    `SELECT * FROM meta_goals
      WHERE user_id = $1
        AND (status IS NULL OR NOT (status = ANY($2::text[])))`,
    [userId, FINISHED_STATUSES]
  );
  return result.rows;
}

function isFinishedStatus(status) {
  return status != null && FINISHED_STATUSES.includes(status);
}

// `IS DISTINCT FROM`, not `!=`: every goal created after the metric
// redesign has `goal_type IS NULL` (see aiCoach.js's create_goal insert),
// and `NULL != 'ftp_vo2max'` is NULL, so a plain `!=` dropped all of them.
// A meta-goal then had zero sub-goals and was skipped entirely — which is
// why Impact on Goals showed "No active goals found" for every goal made
// since the redesign.
async function getSubGoalsForMetaGoals(metaGoalIds) {
  if (metaGoalIds.length === 0) return [];
  const result = await pool.query(
    'SELECT * FROM goals WHERE meta_goal_id = ANY($1::int[]) AND goal_type IS DISTINCT FROM $2',
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

async function deleteProgressForMetaGoals(userId, metaGoalIds) {
  if (metaGoalIds.length === 0) return;
  await pool.query(
    'DELETE FROM activity_meta_goals_progress WHERE user_id = $1 AND meta_goal_id = ANY($2::int[])',
    [userId, metaGoalIds]
  );
}

module.exports = {
  FINISHED_STATUSES,
  isFinishedStatus,
  deleteProgressForMetaGoals,
  getCachedProgress,
  getMetaGoalsByIds,
  getActiveMetaGoals,
  getSubGoalsForMetaGoals,
  upsertProgress,
};
