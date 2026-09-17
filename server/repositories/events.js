// SQL for the events domain (T-4.1). Extracted verbatim from server.js's
// /api/events* handlers — see routes/events.js for the HTTP layer. Distinct
// from calendar_events — a separate legacy feature (docs/audit/00-AUDIT-AND-
// PLAN.md T-6.4 flags it as a legacy-candidate).
const { pool } = require('../db');

async function listEvents(userId) {
  const result = await pool.query(
    'SELECT * FROM events WHERE user_id = $1 ORDER BY start_date ASC',
    [userId]
  );
  return result.rows;
}

async function createEvent(userId, { title, description, link, start_date, background_color }) {
  const result = await pool.query(
    'INSERT INTO events (user_id, title, description, link, start_date, background_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, title, description || null, link || null, start_date, background_color || '#274DD3']
  );
  return result.rows[0];
}

async function getEvent(id, userId) {
  const result = await pool.query('SELECT * FROM events WHERE id = $1 AND user_id = $2', [id, userId]);
  return result.rows[0] || null;
}

async function updateEvent(id, userId, { title, description, link, start_date, background_color }) {
  const result = await pool.query(
    'UPDATE events SET title = $1, description = $2, link = $3, start_date = $4, background_color = $5, updated_at = NOW() WHERE id = $6 AND user_id = $7 RETURNING *',
    [title, description || null, link || null, start_date, background_color || '#274DD3', id, userId]
  );
  return result.rows[0] || null;
}

async function deleteEvent(id, userId) {
  const result = await pool.query('DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
  return result.rows[0] || null;
}

module.exports = { listEvents, createEvent, getEvent, updateEvent, deleteEvent };
