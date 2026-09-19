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

async function createItem(userId, { section, item, checked, link }) {
  const result = await pool.query(
    'INSERT INTO checklist (user_id, section, item, checked, link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [userId, section, item, checked ?? false, link ?? null]
  );
  return result.rows[0];
}

// Partial update: builds SET clause from whichever of checked/link/item/
// section were actually passed (service layer already rejected an empty
// body before this is called). Caller-scoped by user_id, same as every
// other mutation here.
async function updateItem(id, userId, { checked, link, item, section }) {
  const fields = [];
  const params = [];
  let i = 1;
  if (checked !== undefined) { fields.push(`checked = $${i++}`); params.push(checked); }
  if (link !== undefined) { fields.push(`link = $${i++}`); params.push(link); }
  if (item !== undefined) { fields.push(`item = $${i++}`); params.push(item); }
  if (section !== undefined) { fields.push(`section = $${i++}`); params.push(section); }

  params.push(id, userId);
  const result = await pool.query(
    `UPDATE checklist SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
    params
  );
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

async function renameSection(section, userId, newSection) {
  const result = await pool.query(
    'UPDATE checklist SET section = $1 WHERE section = $2 AND user_id = $3 RETURNING *',
    [newSection, section, userId]
  );
  return result.rows;
}

module.exports = { listItems, createItem, updateItem, deleteItem, deleteSection, renameSection };
