// SQL for DELETE /api/account (T-4.1 domain extraction). Moved verbatim
// from server.js.
const { pool, withTransaction } = require('../db');

class AccountNotFoundError extends Error {}

async function getStravaAccessToken(userId) {
  const result = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.strava_access_token || null;
}

// Proof-of-concept use of db.js's withTransaction helper (T-1.1) — the
// other manual BEGIN/COMMIT/ROLLBACK blocks in this file are migrated to it
// separately (T-4.2), not as part of introducing it here.
//
// Throws AccountNotFoundError (instead of returning) when the `users` delete
// affects 0 rows, so withTransaction rolls back instead of committing a
// no-op delete.
async function deleteAccountCascade(userId) {
  await withTransaction(async (client) => {
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
      'DELETE FROM users WHERE id = $1',
    ];

    // Any failure here must propagate (withTransaction rolls back on any
    // thrown error) instead of being swallowed per-statement — otherwise a
    // FK violation on one table would silently leave the account only
    // partially deleted.
    let usersDeleteResult;
    for (const query of deleteQueries) {
      const result = await client.query(query, [userId]);
      if (query.startsWith('DELETE FROM users ')) usersDeleteResult = result;
    }

    if (!usersDeleteResult || usersDeleteResult.rowCount === 0) {
      throw new AccountNotFoundError('User not found');
    }
  });
}

module.exports = {
  AccountNotFoundError,
  getStravaAccessToken,
  deleteAccountCascade,
};
