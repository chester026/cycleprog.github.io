// SQL for skills_history (T-4.2 domain extraction, S-28/S-34/S-35 audit) —
// moved out of routes/skills.js and routes/skillsHistory.js so those files
// don't call pool.query directly. Same SQL, same semantics as before.
const { pool } = require('../db');

/** Most recent skills_history row for a user, or null. */
async function getLastSnapshot(userId) {
  const result = await pool.query(
    'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

/** The second-most-recent snapshot (used by GET /api/skills when the latest snapshot already matches lastActivityId — "previous" for the trend badge must skip the just-matched row). */
async function getSecondLastSnapshot(userId) {
  const result = await pool.query(
    'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC OFFSET 1 LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

/** Snapshot at or before a given date (closest match), or null. */
async function getSnapshotAtOrBefore(userId, date) {
  const result = await pool.query(
    `SELECT * FROM skills_history
     WHERE user_id = $1 AND snapshot_date <= $2
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId, date]
  );
  return result.rows[0] || null;
}

/**
 * Inserts (or updates, on a same-day conflict) a manual admin snapshot.
 * Returns `{id, snapshot_date, created_at}`.
 */
async function upsertManualSnapshot(userId, { climbing, sprint, endurance, tempo, power, consistency, last_activity_id }) {
  const result = await pool.query(
    `INSERT INTO skills_history
      (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
     VALUES
      ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      climbing = EXCLUDED.climbing,
      sprint = EXCLUDED.sprint,
      endurance = EXCLUDED.endurance,
      tempo = EXCLUDED.tempo,
      power = EXCLUDED.power,
      consistency = EXCLUDED.consistency,
      last_activity_id = EXCLUDED.last_activity_id,
      created_at = NOW()
     RETURNING id, snapshot_date, created_at`,
    // skills_history columns are INTEGER — pg rejects '57.5' as text for int4.
    [userId, ...[climbing, sprint, endurance, tempo, power, consistency].map(Math.round), last_activity_id]
  );
  return result.rows[0];
}

/** Deletes every snapshot for a user except the 2 most recent (by created_at). */
async function pruneToLastTwo(userId) {
  await pool.query(
    `DELETE FROM skills_history
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM skills_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 2
       )`,
    [userId]
  );
}

// S-34: `limit` used to be `parseInt(limit)` with no upper bound — an
// arbitrarily large `?limit=` returned an arbitrarily large result set (and
// `parseInt('abc')` is NaN, which pg can't bind as a bigint and throws,
// surfacing as a 500). Callers must pass an already-validated positive
// integer; this clamps it to [1, 500] as a second line of defense.
const MAX_RANGE_LIMIT = 500;

/** Last `limit` snapshots (id, snapshot_date, 6 scales, created_at), newest first. `limit` is clamped to [1, 500]. */
async function getRecentSnapshots(userId, limit) {
  const clampedLimit = Math.max(1, Math.min(Number(limit) || 1, MAX_RANGE_LIMIT));
  const result = await pool.query(
    `SELECT id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, created_at
     FROM skills_history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, clampedLimit]
  );
  return result.rows;
}

/** Snapshots (snapshot_date + 6 scales) within a date range, oldest first. Nulls fall back to "last 3 months". */
async function getSnapshotsInRange(userId, startDate, endDate) {
  const result = await pool.query(
    `SELECT snapshot_date, climbing, sprint, endurance, tempo, power, consistency
     FROM skills_history
     WHERE user_id = $1
       AND snapshot_date >= COALESCE($2::date, CURRENT_DATE - INTERVAL '3 months')
       AND snapshot_date <= COALESCE($3::date, CURRENT_DATE)
     ORDER BY snapshot_date ASC`,
    [userId, startDate || null, endDate || null]
  );
  return result.rows;
}

/** Id of the most recent snapshot created within [start, end], or null. */
async function getLastSnapshotIdInWindow(userId, start, end) {
  const result = await pool.query(
    `SELECT id FROM skills_history
     WHERE user_id = $1
       AND created_at >= $2
       AND created_at <= $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, start, end]
  );
  return result.rows[0]?.id || null;
}

/** Deletes every snapshot in [start, end] except `keepId`. Returns the number of rows deleted. */
async function deleteSnapshotsInWindowExcept(userId, start, end, keepId) {
  const result = await pool.query(
    `DELETE FROM skills_history
     WHERE user_id = $1
       AND created_at >= $2
       AND created_at <= $3
       AND id != $4
     RETURNING id`,
    [userId, start, end, keepId]
  );
  return result.rowCount;
}

module.exports = {
  MAX_RANGE_LIMIT,
  getLastSnapshot,
  getSecondLastSnapshot,
  getSnapshotAtOrBefore,
  upsertManualSnapshot,
  pruneToLastTwo,
  getRecentSnapshots,
  getSnapshotsInRange,
  getLastSnapshotIdInWindow,
  deleteSnapshotsInWindowExcept,
};
