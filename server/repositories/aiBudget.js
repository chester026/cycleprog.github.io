// SQL for the ai_usage_daily table (T-4.4, audit S-31) — per-user daily
// OpenAI token accounting. See services/aiBudget.js for the budget-check
// logic built on top of this, and migrations/1758000000006_ai-usage-daily.sql
// for the table itself.
const { pool } = require('../db');

// Upserts today's usage row for a user, adding to any existing counts for
// that (user_id, day) rather than overwriting — a user can make several
// OpenAI calls in one day, each one recording its own increment.
async function recordUsage(userId, day, promptTokens, completionTokens, db = pool) {
  await db.query(
    `INSERT INTO ai_usage_daily (user_id, day, prompt_tokens, completion_tokens, requests)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET
       prompt_tokens = ai_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
       completion_tokens = ai_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
       requests = ai_usage_daily.requests + 1`,
    [userId, day, promptTokens || 0, completionTokens || 0]
  );
}

async function getUsageForDay(userId, day, db = pool) {
  const result = await db.query(
    'SELECT prompt_tokens, completion_tokens, requests FROM ai_usage_daily WHERE user_id = $1 AND day = $2',
    [userId, day]
  );
  return result.rows[0] || { prompt_tokens: 0, completion_tokens: 0, requests: 0 };
}

// Per-user totals over the last `days` calendar days (inclusive of today) —
// backs GET /api/admin/ai-usage?days=N. Ordered by total tokens used,
// heaviest users first.
async function getUserTotals(days, db = pool) {
  const result = await db.query(
    `SELECT u.user_id,
            SUM(u.prompt_tokens)::bigint AS prompt_tokens,
            SUM(u.completion_tokens)::bigint AS completion_tokens,
            SUM(u.prompt_tokens + u.completion_tokens)::bigint AS total_tokens,
            SUM(u.requests)::int AS requests
     FROM ai_usage_daily u
     WHERE u.day >= (CURRENT_DATE - ($1::int - 1))
     GROUP BY u.user_id
     ORDER BY total_tokens DESC`,
    [days]
  );
  return result.rows;
}

module.exports = { recordUsage, getUsageForDay, getUserTotals };
