// SQL for the admin manual analytics-snapshot fallback (T-4.2, S-28: "no
// pool.query in routes/" DoD leftover from T-4.1). Moved verbatim from
// routes/analyticsSnapshot.js — see that file for the auth/response logic.
const { pool } = require('../db');

async function findSnapshotByLastActivity(userId, lastActivityId) {
  const result = await pool.query(
    'SELECT id FROM analytics_snapshots WHERE user_id = $1 AND last_activity_id = $2',
    [userId, lastActivityId]
  );
  return result.rows[0] || null;
}

async function upsertSnapshot(userId, {
  lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount,
}) {
  await pool.query(
    `INSERT INTO analytics_snapshots (
      user_id, snapshot_date, last_activity_id,
      avg_power, max_power, min_power,
      avg_hr, max_hr, min_hr,
      avg_speed, max_speed, min_speed,
      avg_cadence, max_cadence, min_cadence,
      vo2max, activities_count
    ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      last_activity_id = EXCLUDED.last_activity_id,
      avg_power = EXCLUDED.avg_power, max_power = EXCLUDED.max_power, min_power = EXCLUDED.min_power,
      avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr, min_hr = EXCLUDED.min_hr,
      avg_speed = EXCLUDED.avg_speed, max_speed = EXCLUDED.max_speed, min_speed = EXCLUDED.min_speed,
      avg_cadence = EXCLUDED.avg_cadence, max_cadence = EXCLUDED.max_cadence, min_cadence = EXCLUDED.min_cadence,
      vo2max = EXCLUDED.vo2max, activities_count = EXCLUDED.activities_count,
      created_at = NOW()`,
    [
      userId, lastActivityId,
      power?.avg || null, power?.max || null, power?.min || null,
      heart?.avg || null, heart?.max || null, heart?.min || null,
      speed?.avg || null, speed?.max || null, speed?.min || null,
      cadence?.avg || null, cadence?.max || null, cadence?.min || null,
      vo2max || null, activitiesCount || 0
    ]
  );
}

// Same principle as skills_history: we only ever compare "latest vs
// previous", so there's no reason to keep more than 2 rows per user — trim
// right after every successful save.
async function trimSnapshotsKeepingLatest(userId, keep = 2) {
  await pool.query(
    `DELETE FROM analytics_snapshots
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM analytics_snapshots
         WHERE user_id = $1
         ORDER BY snapshot_date DESC
         LIMIT $2
       )`,
    [userId, keep]
  );
}

async function getLatestSnapshot(userId) {
  const result = await pool.query(
    'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

async function getSnapshotHistory(userId, limit) {
  const result = await pool.query(
    'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows;
}

module.exports = {
  findSnapshotByLastActivity,
  upsertSnapshot,
  trimSnapshotsKeepingLatest,
  getLatestSnapshot,
  getSnapshotHistory,
};
