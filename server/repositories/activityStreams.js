// SQL for the `activity_streams` raw-streams cache (migration
// `1758000000017_activity-streams.sql`). The blob is gzip(JSON) — a 5 h ride
// is ~150 KB of JSON and ~25 KB gzipped, so the compression happens here,
// at the storage boundary, and every caller sees plain objects. The
// interface is deliberately just get/save/deleteOlderThan so the blob could
// move to object storage later by swapping this one file.
const zlib = require('zlib');
const { pool } = require('../db');

/** Cached streams object for one ride, or `null` when nothing is cached. */
async function getStreams(userId, stravaId, db = pool) {
  const result = await db.query(
    'SELECT streams FROM activity_streams WHERE user_id = $1 AND strava_id = $2',
    [userId, stravaId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return JSON.parse(zlib.gunzipSync(row.streams).toString('utf8'));
}

/** Upserts the streams object for one ride; `keys` records which streams Strava actually returned. */
async function saveStreams(userId, stravaId, streams, db = pool) {
  const blob = zlib.gzipSync(Buffer.from(JSON.stringify(streams), 'utf8'));
  const keys = Object.keys(streams || {});
  await db.query(
    `INSERT INTO activity_streams (user_id, strava_id, streams, keys, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, strava_id)
     DO UPDATE SET streams = EXCLUDED.streams, keys = EXCLUDED.keys, fetched_at = NOW()`,
    [userId, stravaId, blob, keys]
  );
}

/** Retention: drops rows fetched more than `days` days ago. Returns the row count. */
async function deleteOlderThan(days, db = pool) {
  const result = await db.query(
    "DELETE FROM activity_streams WHERE fetched_at < NOW() - ($1::int * INTERVAL '1 day')",
    [days]
  );
  return result.rowCount;
}

module.exports = { getStreams, saveStreams, deleteOlderThan };
