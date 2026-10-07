// SQL for meta_goal_rides — the rides attached to a completed meta-goal
// (migrations/1758000000012_meta-goal-rides.sql). Every function takes an
// optional `db` so the service can run them on one withTransaction client.
const { pool } = require('../db');

// BIGINT comes back from pg as a string; ride ids fit in a double (Strava ids
// are < 2^53), and the app's Activity.id is a number.
function toRide(row) {
  return { ...row, strava_id: Number(row.strava_id) };
}

/** Attached rides with their ride stats, newest ride first. LEFT JOIN: a pruned synced row keeps its attachment (stats null). */
async function listRides(metaGoalId, userId, db = pool) {
  const result = await db.query(
    `SELECT r.strava_id, a.name, a.start_date, a.distance, a.moving_time,
            a.total_elevation_gain, a.average_speed, r.attached_at
       FROM meta_goal_rides r
       LEFT JOIN synced_activities a ON a.user_id = r.user_id AND a.strava_id = r.strava_id
      WHERE r.meta_goal_id = $1 AND r.user_id = $2
      ORDER BY a.start_date DESC NULLS LAST, r.strava_id DESC`,
    [metaGoalId, userId]
  );
  return result.rows.map(toRide);
}

/** The subset of `stravaIds` that are this user's synced rides, with their start dates. */
async function findSyncedRides(userId, stravaIds, db = pool) {
  if (stravaIds.length === 0) return [];
  const result = await db.query(
    'SELECT strava_id, start_date FROM synced_activities WHERE user_id = $1 AND strava_id = ANY($2::bigint[])',
    [userId, stravaIds]
  );
  return result.rows.map(toRide);
}

/** Replaces the goal's attached rides with `stravaIds` (ownership already checked by the caller). */
async function replaceRides(metaGoalId, userId, stravaIds, db = pool) {
  await db.query('DELETE FROM meta_goal_rides WHERE meta_goal_id = $1', [metaGoalId]);
  if (stravaIds.length === 0) return;
  await db.query(
    `INSERT INTO meta_goal_rides (meta_goal_id, user_id, strava_id)
     SELECT $1, $2, UNNEST($3::bigint[])`,
    [metaGoalId, userId, stravaIds]
  );
}

module.exports = { listRides, findSyncedRides, replaceRides };
