// SQL for the shared `activity_analysis` cache table (migration
// `1758000000004_activity-analysis.sql`): one cached, server-computed result
// per (user_id, strava_id, kind) — see that migration's comment for why
// `kind` exists (room for more than one analysis shape over the same
// activity without another migration). Originally lived inline in
// services/ftpAnalysis.js (`kind = 'ftp'`); factored out here (T-6/hr-zones
// work) so services/hrZones.js (`kind = 'hr_histogram'`) can reuse the exact
// same two queries instead of copy-pasting them.
const { pool } = require('../db');

/**
 * Reads the cached result for one (userId, stravaId, kind), or `null` when
 * nothing has been computed yet. `db` defaults to the shared pool but may be
 * a transaction client (see GUIDE-4.2's `db = pool` convention) — not
 * currently needed by either caller, kept for consistency with the rest of
 * the repository layer.
 */
async function getCachedAnalysis(userId, stravaId, kind, db = pool) {
  const result = await db.query(
    `SELECT result, computed_at FROM activity_analysis WHERE user_id = $1 AND strava_id = $2 AND kind = $3`,
    [userId, stravaId, kind]
  );
  return result.rows[0] || null;
}

/**
 * Upserts the result for one (userId, stravaId, kind) — a repeat call for
 * the same triple overwrites rather than duplicating (UNIQUE (user_id,
 * strava_id, kind), see the migration).
 */
async function saveAnalysis(userId, stravaId, kind, result, db = pool) {
  await db.query(
    `INSERT INTO activity_analysis (user_id, strava_id, kind, result, computed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, strava_id, kind)
     DO UPDATE SET result = EXCLUDED.result, computed_at = NOW()`,
    [userId, stravaId, kind, JSON.stringify(result)]
  );
}

module.exports = { getCachedAnalysis, saveAnalysis };
