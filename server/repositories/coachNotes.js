// SQL for coach memory (T-? coach-notes contract, packages/shared/src/
// types/coachNotes.ts). Ownership-scoped like every other per-user table
// here — every mutation is WHERE id = $1 AND user_id = $2.
const { pool } = require('../db');

async function listNotes(userId) {
  const result = await pool.query(
    'SELECT * FROM coach_notes WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  return result.rows;
}

async function createNote(userId, { note, category, source }) {
  const result = await pool.query(
    'INSERT INTO coach_notes (user_id, note, category, source) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, note, category || 'other', source || 'coach']
  );
  return result.rows[0];
}

// Partial update: builds SET clause from whichever of note/category were
// actually passed. `updated_at` always moves, even on a no-op caller-side
// (there is none today — services/coachNotes.js's schema requires at least
// one field), same convention as repositories/checklist.js's updateItem.
async function updateNote(id, userId, { note, category }) {
  const fields = [];
  const params = [];
  let i = 1;
  if (note !== undefined) { fields.push(`note = $${i++}`); params.push(note); }
  if (category !== undefined) { fields.push(`category = $${i++}`); params.push(category); }
  fields.push('updated_at = NOW()');

  params.push(id, userId);
  const result = await pool.query(
    `UPDATE coach_notes SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function deleteNote(id, userId) {
  const result = await pool.query(
    'DELETE FROM coach_notes WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
