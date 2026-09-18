// SQL for the coach_conversations / coach_messages domain (T-4.1). Extracted
// verbatim from server.js's /api/coach* handlers — see routes/coach.js for
// the HTTP layer and services/coach.js for the coach instance itself.
const { pool } = require('../db');

async function listConversations(userId) {
  const result = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM coach_messages m WHERE m.conversation_id = c.id) AS message_count
     FROM coach_conversations c
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC
     LIMIT 50`,
    [userId]
  );
  return result.rows;
}

async function findConversationByActivity(userId, activityId) {
  const result = await pool.query(
    `SELECT id, title, created_at, updated_at FROM coach_conversations
     WHERE user_id = $1 AND activity_id = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, activityId]
  );
  return result.rows[0] || null;
}

async function getConversation(id, userId) {
  const result = await pool.query(
    'SELECT * FROM coach_conversations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows[0] || null;
}

const MAX_MESSAGES_LIMIT = 500;
const DEFAULT_MESSAGES_LIMIT = 200;

// S-34: a long-running conversation's `coach_messages` history was returned
// in full on every GET /api/coach/conversations/:id. Caps it to the last
// `limit` messages (default 200, hard max 500) instead of the whole table —
// picked with an ORDER BY created_at DESC LIMIT (cheap: indexed, bounded)
// then re-sorted ASC in JS so callers still see chronological order, same
// as before. Also returns the true total so the route can surface it via
// X-Total-Count even though only the tail is returned.
async function getMessages(conversationId, { limit = DEFAULT_MESSAGES_LIMIT } = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, MAX_MESSAGES_LIMIT));
  const [countResult, rowsResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM coach_messages WHERE conversation_id = $1', [conversationId]),
    pool.query('SELECT * FROM coach_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2', [
      conversationId,
      cappedLimit,
    ]),
  ]);
  const total = countResult.rows[0]?.n || 0;
  const messages = rowsResult.rows.reverse(); // DESC->ASC: back to chronological order
  return { messages, total };
}

async function deleteConversation(id, userId) {
  const result = await pool.query(
    'DELETE FROM coach_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rows[0] || null;
}

// --- POST /api/coach/chat helpers ------------------------------------------

async function conversationExists(id, userId) {
  const result = await pool.query(
    'SELECT id FROM coach_conversations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return result.rows.length > 0;
}

async function createConversation(id, userId, title) {
  await pool.query(
    'INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, $3)',
    [id, userId, title]
  );
}

async function insertUserMessage(id, conversationId, content) {
  await pool.query(
    'INSERT INTO coach_messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)',
    [id, conversationId, 'user', content]
  );
}

async function getToolCallsForConversation(conversationId) {
  const result = await pool.query(
    `SELECT tool_calls FROM coach_messages WHERE conversation_id = $1 AND tool_calls IS NOT NULL ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

async function findDuplicateByActivity(userId, activityId, excludeConversationId) {
  const result = await pool.query(
    `SELECT id FROM coach_conversations
     WHERE user_id = $1 AND activity_id = $2 AND id != $3
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, activityId, excludeConversationId]
  );
  return result.rows[0] || null;
}

async function deleteConversationById(id) {
  await pool.query('DELETE FROM coach_conversations WHERE id = $1', [id]);
}

async function tagConversationActivity(conversationId, activityId) {
  await pool.query(
    'UPDATE coach_conversations SET activity_id = $1 WHERE id = $2 AND activity_id IS NULL',
    [activityId, conversationId]
  );
}

// tokenUsage (T-4.4, audit S-31): a plain object ({prompt_tokens,
// completion_tokens, total_tokens, model}), NOT pre-stringified like
// toolCalls/suggestions — JSON.stringify(null) would otherwise store the
// literal string "null" instead of a real SQL NULL.
async function insertAssistantMessage(id, conversationId, content, toolCalls, suggestions, tokenUsage = null) {
  await pool.query(
    `INSERT INTO coach_messages (id, conversation_id, role, content, tool_calls, suggestions, token_usage)
     VALUES ($1, $2, 'assistant', $3, $4, $5, $6)`,
    [id, conversationId, content, toolCalls, suggestions, tokenUsage ? JSON.stringify(tokenUsage) : null]
  );
}

async function touchConversation(conversationId) {
  await pool.query('UPDATE coach_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
}

module.exports = {
  listConversations,
  findConversationByActivity,
  getConversation,
  getMessages,
  deleteConversation,
  conversationExists,
  createConversation,
  insertUserMessage,
  getToolCallsForConversation,
  findDuplicateByActivity,
  deleteConversationById,
  tagConversationActivity,
  insertAssistantMessage,
  touchConversation,
};
