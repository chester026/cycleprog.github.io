// SQL for the rides domain (T-4.1). Extracted verbatim from server.js's
// /api/rides* handlers — see routes/rides.js for the HTTP layer.
const { pool } = require('../db');

async function listRides(userId) {
  const result = await pool.query('SELECT * FROM rides WHERE user_id = $1 ORDER BY start DESC', [userId]);
  return result.rows;
}

async function createRide(userId, { title, location, locationLink, details, start }) {
  const result = await pool.query(
    'INSERT INTO rides (user_id, title, location, location_link, details, start) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, title, location, locationLink, details, start]
  );
  return result.rows[0];
}

async function updateRide(id, userId, { title, location, locationLink, details, start }) {
  const result = await pool.query(
    'UPDATE rides SET title=$1, location=$2, location_link=$3, details=$4, start=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
    [title, location, locationLink, details, start, id, userId]
  );
  return result.rows[0] || null;
}

async function deleteRide(id, userId) {
  const result = await pool.query(
    'DELETE FROM rides WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

// Batch-inserts an entire import in one UNNEST round-trip instead of N
// single INSERTs (S-28). `db` defaults to the shared pool but accepts a
// `withTransaction` client — routes/rides.js's POST /import wraps this so a
// mid-batch failure (e.g. an invalid `start` the UNNEST cast rejects) never
// leaves a partial import committed. Returns the number of rows inserted.
async function importRidesBatch(userId, rides, db = pool) {
  if (!rides || rides.length === 0) return 0;
  const result = await db.query(
    `INSERT INTO rides (user_id, title, location, location_link, details, start)
     SELECT $1, t.title, t.location, t.location_link, t.details, t.start
     FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[])
     AS t(title, location, location_link, details, start)`,
    [
      userId,
      rides.map((r) => r.title || null),
      rides.map((r) => r.location || null),
      rides.map((r) => r.locationLink || null),
      rides.map((r) => r.details || null),
      rides.map((r) => r.start),
    ]
  );
  return result.rowCount;
}

module.exports = {
  listRides,
  createRide,
  updateRide,
  deleteRide,
  importRidesBatch,
};
