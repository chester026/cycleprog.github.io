// What a ride was MEANT to be (services/rideAnalysis.js): its name and local
// date from synced_activities, and the structured sessions the calendar held
// for that date (calendar_events.workout — docs/plans/workout-blocks.md).
// The breakdown reads the ride's work blocks against the watts range the
// plan, or the name, asked for.
const { pool } = require('../db');

/** `{ name, date }` (date = the ride's local day, YYYY-MM-DD) or null when the ride is not synced. */
async function getRideHeader(userId, stravaId, db = pool) {
  const result = await db.query(
    `SELECT name, COALESCE(raw->>'start_date_local', start_date::text) AS started
     FROM synced_activities WHERE user_id = $1 AND strava_id = $2`,
    [userId, stravaId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { name: row.name || null, date: row.started ? String(row.started).slice(0, 10) : null };
}

/** Planned sessions of that day that carry blocks: `[{ title, workout }]`. */
async function getPlannedWorkouts(userId, date, db = pool) {
  const result = await db.query(
    `SELECT title, workout FROM calendar_events
     WHERE user_id = $1 AND type = 'planned_ride' AND start_date = $2 AND workout IS NOT NULL
     ORDER BY id`,
    [userId, date],
  );
  return result.rows;
}

module.exports = { getRideHeader, getPlannedWorkouts };
