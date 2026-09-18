// SQL for admin routes (T-4.2, S-28: "no pool.query in routes/" DoD
// leftover from T-4.1). Moved verbatim from routes/admin.js — see that file
// for the auth/business logic that uses these.
const { pool, withTransaction } = require('../db');

class AdminUserNotFoundError extends Error {}

async function getStravaSyncStatusPerUser() {
  const result = await pool.query(`
    SELECT u.id AS user_id, u.email,
           COUNT(sa.strava_id)::int AS activities,
           COUNT(sa.strava_id) FILTER (WHERE sa.raw IS NULL)::int AS without_raw,
           MAX(sa.start_date) AS last_activity,
           MAX(sa.synced_at) AS last_synced_at
      FROM users u
      LEFT JOIN synced_activities sa ON sa.user_id = u.id
     WHERE u.strava_id IS NOT NULL
     GROUP BY u.id, u.email
     ORDER BY u.id`);
  return result.rows;
}

async function getStravaSyncStatusTotals() {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS activities,
           COUNT(*) FILTER (WHERE raw IS NULL)::int AS without_raw,
           pg_size_pretty(pg_total_relation_size('synced_activities')) AS table_size
      FROM synced_activities`);
  return result.rows[0];
}

async function listUsersForAdmin() {
  const result = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.email_verified,
      u.strava_id,
      u.strava_access_token IS NOT NULL as has_strava_token,
      u.created_at,
      p.experience_level,
      (SELECT COUNT(*) FROM rides r WHERE r.user_id = u.id) as rides_count,
      (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) as goals_count,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) as events_count
    FROM users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
    ORDER BY u.created_at DESC
  `);
  return result.rows;
}

async function getUserStravaAccessToken(userId) {
  const result = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.strava_access_token || null;
}

async function clearStravaLinkForUser(userId) {
  await pool.query(`
    UPDATE users
    SET
      strava_access_token = NULL,
      strava_refresh_token = NULL,
      strava_expires_at = NULL,
      strava_id = NULL
    WHERE id = $1
  `, [userId]);
  await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM synced_bikes WHERE user_id = $1', [userId]);
}

// Same cascade as repositories/account.js's deleteAccountCascade (kept as
// its own copy rather than a shared import — this one is admin-triggered
// against an arbitrary userId and reports per-table deletedRecords, whereas
// account.js's is self-service and doesn't). Throws
// AdminUserNotFoundError (instead of returning) when the `users` delete
// affects 0 rows, so withTransaction rolls back instead of committing a
// no-op delete.
async function deleteUserCascade(userId) {
  return withTransaction(async (client) => {
    const deleteQueries = [
      'DELETE FROM activity_meta_goals_progress WHERE user_id = $1',
      'DELETE FROM custom_training_plans WHERE user_id = $1',
      'DELETE FROM generated_weekly_plans WHERE user_id = $1',
      'DELETE FROM checklist WHERE user_id = $1',
      'DELETE FROM ai_analysis_cache WHERE user_id = $1',
      'DELETE FROM bike_component_resets WHERE user_id = $1',
      'DELETE FROM rides WHERE user_id = $1',
      'DELETE FROM goals WHERE user_id = $1',
      'DELETE FROM meta_goals WHERE user_id = $1',
      'DELETE FROM events WHERE user_id = $1',
      'DELETE FROM user_images WHERE user_id = $1',
      'DELETE FROM user_profiles WHERE user_id = $1',
      'DELETE FROM skills_history WHERE user_id = $1',
      'DELETE FROM analytics_snapshots WHERE user_id = $1',
      'DELETE FROM user_achievements WHERE user_id = $1',
      'DELETE FROM users WHERE id = $1'
    ];

    const deletedRecords = {};

    // As in repositories/account.js: any failure here must propagate
    // (withTransaction rolls back on any thrown error) instead of being
    // swallowed per-statement.
    for (const query of deleteQueries) {
      const result = await client.query(query, [userId]);
      const tableName = query.split('FROM ')[1].split(' WHERE')[0];
      deletedRecords[tableName] = result.rowCount;
    }

    if (!deletedRecords.users) {
      throw new AdminUserNotFoundError('User not found');
    }

    return deletedRecords;
  });
}

module.exports = {
  AdminUserNotFoundError,
  getStravaSyncStatusPerUser,
  getStravaSyncStatusTotals,
  listUsersForAdmin,
  getUserStravaAccessToken,
  clearStravaLinkForUser,
  deleteUserCascade,
};
