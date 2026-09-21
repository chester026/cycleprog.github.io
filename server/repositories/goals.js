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

// `db` defaults to the shared pool but accepts a `withTransaction` client so
// callers (POST /api/meta-goals/ai-generate) can run this on the same
// connection/BEGIN as the sub-goal inserts + progress updates that follow it
// (S-28 — previously these were three+ unrelated round-trips with no
// atomicity: a crash between them left an orphan meta_goals row with no
// sub-goals).
async function insertAiMetaGoal(userId, { title, description, target_date, ai_context, tier }, db = pool) {
  const result = await db.query(
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

// Builds one row of insertAiSubGoalsBatch's input from an FTP sub-goal (see
// that function). `targetValue`/`vo2maxValue` are resolved by the caller
// before batching — calculateVO2maxForPeriod is a per-sub-goal async read,
// not something UNNEST can do inline.
function ftpSubGoalRow(subGoal, { targetValue, vo2maxValue }) {
  return {
    title: subGoal.title,
    description: subGoal.description,
    target_value: targetValue,
    unit: subGoal.unit,
    goal_type: subGoal.goal_type,
    period: subGoal.period || '4w',
    hr_threshold: subGoal.hr_threshold || 160,
    duration_threshold: subGoal.duration_threshold || 120,
    vo2max_value: vo2maxValue,
    source: null,
    metric: null,
    priority: subGoal.priority || 3,
    reasoning: subGoal.reasoning || '',
  };
}

// Builds one row of insertAiSubGoalsBatch's input from a metric-based
// (non-FTP) sub-goal — see ftpSubGoalRow's comment.
function metricSubGoalRow(subGoal, { targetValue }) {
  return {
    title: subGoal.title,
    description: subGoal.description,
    target_value: targetValue || 0,
    unit: subGoal.unit,
    goal_type: subGoal.goal_type || null,
    period: subGoal.period || null,
    hr_threshold: null,
    duration_threshold: null,
    vo2max_value: null,
    source: subGoal.metric?.source || null,
    metric: subGoal.metric || null,
    priority: subGoal.priority || 3,
    reasoning: subGoal.reasoning || '',
  };
}

// Batch-inserts every AI-generated sub-goal for one meta-goal in a single
// round-trip via UNNEST (S-28) instead of the old N single INSERTs (one
// `insertAiFtpSubGoal`/`insertAiMetricSubGoal` call per sub-goal). `rows` are
// pre-shaped via ftpSubGoalRow/metricSubGoalRow — the FTP/metric column
// split (hr_threshold/vo2max_value vs source/metric) collapses into one
// shared column set here, NULL on whichever side doesn't apply. No dates:
// a sub-goal shares its meta-goal's window (services/goals.js's
// goalWindow). Order of the returned rows is not guaranteed to match `rows`'
// order — callers that need to pair a returned row back to its input use
// the returned `id`s, not array position.
async function insertAiSubGoalsBatch(userId, metaGoalId, rows, db = pool) {
  if (!rows || rows.length === 0) return [];
  const result = await db.query(
    `INSERT INTO goals (
      user_id, meta_goal_id, title, description, target_value, current_value,
      unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value,
      source, metric, priority, reasoning
    )
    SELECT $1, $2, t.title, t.description, t.target_value, 0,
           t.unit, t.goal_type, t.period, t.hr_threshold, t.duration_threshold, t.vo2max_value,
           t.source, t.metric, t.priority, t.reasoning
    FROM UNNEST(
      $3::text[], $4::text[], $5::numeric[],
      $6::text[], $7::text[], $8::text[],
      $9::int[], $10::int[], $11::numeric[],
      $12::text[], $13::jsonb[],
      $14::int[], $15::text[]
    ) AS t(title, description, target_value,
           unit, goal_type, period,
           hr_threshold, duration_threshold, vo2max_value,
           source, metric,
           priority, reasoning)
    RETURNING *`,
    [
      userId,
      metaGoalId,
      rows.map((r) => r.title),
      rows.map((r) => r.description),
      rows.map((r) => r.target_value ?? 0),
      rows.map((r) => r.unit),
      rows.map((r) => r.goal_type || null),
      rows.map((r) => r.period || null),
      rows.map((r) => (r.hr_threshold ?? null)),
      rows.map((r) => (r.duration_threshold ?? null)),
      rows.map((r) => (r.vo2max_value ?? null)),
      rows.map((r) => r.source || null),
      rows.map((r) => (r.metric ? JSON.stringify(r.metric) : null)),
      rows.map((r) => r.priority || 3),
      rows.map((r) => r.reasoning || ''),
    ]
  );
  return result.rows;
}

// Batch-writes recomputed current_value's in one UPDATE ... FROM UNNEST
// round-trip instead of N single UPDATEs (S-35 "UPDATE каждой sub-goal в
// цикле") — used by services/goals.js's persistGoalCurrentValues (shared by
// GET /api/goals, GET /api/meta-goals, GET /api/meta-goals/:id) and by
// POST /api/meta-goals/ai-generate's post-insert progress recalculation.
// Scoped by user_id so it can never touch another user's goal even if
// `updates` somehow contained a foreign id. Returns the updated rows (not
// necessarily in `updates`' order).
async function batchUpdateGoalCurrentValues(userId, updates, db = pool) {
  if (!updates || updates.length === 0) return [];
  const result = await db.query(
    `UPDATE goals g SET current_value = t.current_value, updated_at = NOW()
     FROM UNNEST($2::int[], $3::numeric[]) AS t(id, current_value)
     WHERE g.id = t.id AND g.user_id = $1
     RETURNING g.*`,
    [userId, updates.map((u) => u.id), updates.map((u) => u.current_value)]
  );
  return result.rows;
}

/** Raw user_profiles row (no auto-create — see ../recommendations's getUserProfile for that variant), or undefined. Used to build the AI prompt context in POST /api/meta-goals/ai-generate. */
async function getRawUserProfile(userId, db = pool) {
  const result = await db.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
  return result.rows[0];
}

/** Latest skills_history row (all columns), or null. Used by POST /api/meta-goals/ai-generate to seed progress calc for newly-created sub-goals. */
async function getLatestSkillsSnapshot(userId, db = pool) {
  const result = await db.query(
    'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
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
  ftpSubGoalRow,
  metricSubGoalRow,
  insertAiSubGoalsBatch,
  batchUpdateGoalCurrentValues,
  getRawUserProfile,
  getLatestSkillsSnapshot,
  listSubGoalsByMetaGoalPriority,
};
