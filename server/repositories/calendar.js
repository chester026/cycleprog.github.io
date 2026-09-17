// SQL for the calendar_events domain (T-4.1). Extracted verbatim from
// server.js's /api/calendar* handlers — see routes/calendar.js for the HTTP
// layer.
const { pool } = require('../db');

const CALENDAR_EVENT_TYPES = ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'];

// LEFT JOIN meta_goals so the Calendar screen/detail modal can show which
// goal (if any) a training session is working toward without a second round
// trip per event.
async function listEvents(userId, { goalId, from, to, type } = {}) {
  const params = [userId];
  let sql = `SELECT ce.*, mg.title AS goal_title
             FROM calendar_events ce
             LEFT JOIN meta_goals mg ON mg.id = ce.goal_id
             WHERE ce.user_id = $1`;
  // GoalDetailsScreen's "Scheduled sessions" wants every event ever linked to
  // that goal (past + future) — a goal-scoped query is already a small,
  // bounded set, so skip the default date window entirely rather than
  // requiring the caller to guess a wide enough from/to range.
  if (goalId) {
    params.push(goalId);
    sql += ` AND ce.goal_id = $${params.length}`;
  } else {
    params.push(from, to);
    sql += ` AND ce.start_date >= $${params.length - 1} AND ce.start_date <= $${params.length}`;
  }
  if (type) {
    params.push(type);
    sql += ` AND ce.type = $${params.length}`;
  }
  sql += ' ORDER BY ce.start_date ASC';
  const result = await pool.query(sql, params);
  return result.rows;
}

async function createEvent(userId, body) {
  const { type, title, description, location, location_link, start_date, end_date, all_day, start_time, end_time, goal_id } = body;
  const eventType = CALENDAR_EVENT_TYPES.includes(type) ? type : 'planned_ride';
  const result = await pool.query(
    `INSERT INTO calendar_events
       (user_id, type, title, description, location, location_link, start_date, end_date, all_day, start_time, end_time, source, goal_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'user', $12)
     RETURNING *`,
    [
      userId, eventType, title, description || null, location || null, location_link || null,
      start_date, end_date || null, all_day !== undefined ? all_day : true, start_time || null, end_time || null,
      goal_id || null,
    ]
  );
  return result.rows[0];
}

const UPDATE_ALLOWED_FIELDS = ['type', 'title', 'description', 'location', 'location_link', 'start_date', 'end_date', 'all_day', 'start_time', 'end_time', 'completed', 'apple_event_id', 'goal_id'];

async function updateEvent(id, userId, body) {
  const sets = [];
  const values = [id, userId];
  let i = 3;
  for (const key of UPDATE_ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      sets.push(`${key} = $${i}`);
      values.push(body[key]);
      i++;
    }
  }
  if (sets.length === 0) return { noFields: true };
  sets.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    values
  );
  return { row: result.rows[0] || null };
}

async function deleteEvent(id, userId) {
  const result = await pool.query(
    'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 RETURNING id, migrated_from_ride_id',
    [id, userId]
  );
  return result.rows[0] || null;
}

async function deleteMigratedRide(rideId, userId) {
  await pool.query('DELETE FROM rides WHERE id = $1 AND user_id = $2', [rideId, userId]);
}

module.exports = {
  CALENDAR_EVENT_TYPES,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  deleteMigratedRide,
};
