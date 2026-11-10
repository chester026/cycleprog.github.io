// SQL for Garmin Connect as a data source — `garmin_connections`,
// `garmin_activities` (migration 1758000000019; what is and isn't stored is
// explained there) and `garmin_health_days` (migration 1758000000020). Not
// the Connect IQ bridge: that is repositories/garmin.js.
const { pool } = require('../db');
const { HEALTH_COLUMN_TYPES, HEALTH_COLUMNS } = require('../services/garminConnect/healthColumns');

// garmin_activities summary columns, in INSERT order after the two key
// columns. Named like the Strava activity object (see the migration).
const SUMMARY_COLUMNS = [
  'name', 'type', 'sub_sport', 'start_date', 'utc_offset_s',
  'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain',
  'average_speed', 'max_speed', 'average_heartrate', 'max_heartrate', 'average_cadence',
  'average_watts', 'max_watts', 'weighted_average_watts', 'kilojoules', 'device_watts',
  'average_temp', 'device_name',
];
const STORED_COLUMNS = [...SUMMARY_COLUMNS, 'provider', 'analysis', 'analysis_version', 'chart'];

/**
 * Creates the rider's connection or re-points it (same rider reconnecting,
 * or moving from the personal key to OAuth). `connected_at` is kept when the
 * Garmin account is the same one. A Garmin account already linked to ANOTHER
 * rider violates the UNIQUE constraint and throws (pg code 23505).
 */
async function upsertConnection(userId, { garminUserId, transport }, db = pool) {
  const result = await db.query(
    `INSERT INTO garmin_connections (user_id, garmin_user_id, transport)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       connected_at   = CASE WHEN garmin_connections.garmin_user_id = EXCLUDED.garmin_user_id
                             THEN garmin_connections.connected_at ELSE NOW() END,
       garmin_user_id = EXCLUDED.garmin_user_id,
       transport      = EXCLUDED.transport
     RETURNING *`,
    [userId, String(garminUserId), transport]
  );
  return result.rows[0];
}

async function getConnection(userId, db = pool) {
  const result = await db.query('SELECT * FROM garmin_connections WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

async function touchLastSync(userId, db = pool) {
  await db.query('UPDATE garmin_connections SET last_sync_at = NOW() WHERE user_id = $1', [userId]);
}

/**
 * Disconnect. The cascade on garmin_activities removes every ride that came
 * through the connection — Garmin's API terms require it. Returns whether
 * there was a connection.
 */
async function deleteConnection(userId, db = pool) {
  const result = await db.query('DELETE FROM garmin_connections WHERE user_id = $1', [userId]);
  return result.rowCount > 0;
}

/**
 * Inserts or replaces one ride. `activity` carries `garmin_activity_id` plus
 * STORED_COLUMNS; a re-ingest (new analysis version, renamed ride) overwrites
 * the row rather than duplicating it.
 */
async function upsertActivity(userId, activity, db = pool) {
  const values = STORED_COLUMNS.map((column) => {
    const value = activity[column];
    if (column === 'provider' || column === 'analysis') return JSON.stringify(value ?? {});
    return value ?? (column === 'device_watts' ? false : null);
  });
  const placeholders = STORED_COLUMNS.map((_, i) => `$${i + 3}`).join(', ');
  const updates = STORED_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  await db.query(
    `INSERT INTO garmin_activities (user_id, garmin_activity_id, ${STORED_COLUMNS.join(', ')})
     VALUES ($1, $2, ${placeholders})
     ON CONFLICT (user_id, garmin_activity_id) DO UPDATE SET ${updates}, ingested_at = NOW()`,
    [userId, activity.garmin_activity_id, ...values]
  );
}

/** One stored ride with everything (the `chart` still compressed — services/garminConnect/analyze.js decodeChart), or null. */
async function getActivity(userId, garminActivityId, db = pool) {
  const result = await db.query(
    'SELECT * FROM garmin_activities WHERE user_id = $1 AND garmin_activity_id = $2',
    [userId, garminActivityId]
  );
  const row = result.rows[0];
  // pg hands BIGINT back as a string; Garmin ids are far below 2^53.
  return row ? { ...row, garmin_activity_id: Number(row.garmin_activity_id) } : null;
}

/** Map of garmin_activity_id → analysis_version for every stored ride — what a sync skips. */
async function getIngestedVersions(userId, db = pool) {
  const result = await db.query('SELECT garmin_activity_id, analysis_version FROM garmin_activities WHERE user_id = $1', [userId]);
  return new Map(result.rows.map((r) => [Number(r.garmin_activity_id), r.analysis_version]));
}

/** Ride count, newest ride's start and stored bytes, for the status endpoint and the sync summary. */
async function getActivityStats(userId, db = pool) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS activities,
            MAX(start_date) AS last_activity_at,
            COALESCE(SUM(pg_column_size(garmin_activities.*)), 0)::bigint AS stored_bytes
       FROM garmin_activities WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return { activities: row.activities, last_activity_at: row.last_activity_at, stored_bytes: Number(row.stored_bytes) };
}

// --- Health days (migration 1758000000020) ----------------------------------

/**
 * Upserts a batch of days in one round-trip (`rows`: `{ day: 'YYYY-MM-DD',
 * ...HEALTH_COLUMNS }`). For a day already stored, a new reading replaces
 * the old one and a null leaves it alone: a re-sync of today brings newer
 * daytime figures, and a sync where one Garmin endpoint failed must not
 * blank the sleep or HRV an earlier sync stored. Returns the row count.
 */
async function upsertHealthDays(userId, rows, db = pool) {
  if (!rows || rows.length === 0) return 0;
  const recordDef = HEALTH_COLUMNS.map((column) => `${column} ${HEALTH_COLUMN_TYPES[column]}`).join(', ');
  const updates = HEALTH_COLUMNS.map((column) => `${column} = COALESCE(EXCLUDED.${column}, garmin_health_days.${column})`).join(', ');
  const result = await db.query(
    `INSERT INTO garmin_health_days (user_id, day, ${HEALTH_COLUMNS.join(', ')})
     SELECT $1, r.day, ${HEALTH_COLUMNS.map((column) => `r.${column}`).join(', ')}
       FROM jsonb_to_recordset($2::jsonb) AS r(day date, ${recordDef})
     ON CONFLICT (user_id, day) DO UPDATE SET ${updates}, synced_at = NOW()`,
    [userId, JSON.stringify(rows)]
  );
  return result.rowCount;
}

/**
 * The rider's most recent health days, newest first. `day` comes back as a
 * 'YYYY-MM-DD' string, not a Date: a DATE read as a JS Date is midnight in
 * the server's time zone and shifts a day when serialised elsewhere.
 */
async function getHealthDays(userId, { limit = 7 } = {}, db = pool) {
  const result = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, ${HEALTH_COLUMNS.join(', ')}
       FROM garmin_health_days WHERE user_id = $1 ORDER BY garmin_health_days.day DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * How many health days are stored, the newest one ('YYYY-MM-DD' or null) and
 * when health data was last fetched from Garmin (null when never). The last
 * one is its own figure, not garmin_connections.last_sync_at: a ride-only
 * sync touches that too, and must not make stale health data look fresh.
 */
async function getHealthStats(userId, db = pool) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS health_days,
            to_char(MAX(day), 'YYYY-MM-DD') AS last_health_day,
            MAX(synced_at) AS last_health_sync_at
       FROM garmin_health_days WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

module.exports = {
  SUMMARY_COLUMNS,
  upsertHealthDays,
  getHealthDays,
  getHealthStats,
  upsertConnection,
  getConnection,
  touchLastSync,
  deleteConnection,
  upsertActivity,
  getActivity,
  getIngestedVersions,
  getActivityStats,
};
