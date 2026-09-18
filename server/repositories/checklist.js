// SQL for the checklist domain (T-4.1). Extracted verbatim from server.js's
// /api/checklist* handlers — see routes/checklist.js for the HTTP layer.
const { pool } = require('../db');

async function listItems(userId) {
  const result = await pool.query(
    'SELECT * FROM checklist WHERE user_id = $1 ORDER BY section, id',
    [userId]
  );
  return result.rows;
}

async function createItem(userId, { section, item, checked }) {
  const result = await pool.query(
    'INSERT INTO checklist (user_id, section, item, checked) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, section, item, checked ?? false]
  );
  return result.rows[0];
}

// Route branches on whether `link` is present (rename the link) vs falls
// back to `checked` (toggle) — kept exactly as server.js had it.
async function updateItem(id, userId, { checked, link }) {
  let query, params;
  if (link !== undefined) {
    query = 'UPDATE checklist SET link = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [link, id, userId];
  } else {
    query = 'UPDATE checklist SET checked = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [checked, id, userId];
  }
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

async function deleteItem(id, userId) {
  const result = await pool.query(
    'DELETE FROM checklist WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

async function deleteSection(section, userId) {
  const result = await pool.query(
    'DELETE FROM checklist WHERE section = $1 AND user_id = $2 RETURNING *',
    [section, userId]
  );
  return result.rows;
}

module.exports = { listItems, createItem, updateItem, deleteItem, deleteSection };
