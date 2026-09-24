// Per-user daily OpenAI token budget (T-4.4, audit S-31). Shared by every
// OpenAI-backed endpoint: POST /api/coach/chat (routes/coach.js, this
// domain), POST /api/ai-analysis + GET /api/activities/:id/ai-analysis
// (aiAnalysis.js calls recordUsage directly), and POST /api/meta-goals/
// ai-generate (mounts requireAiBudget below — see the report for the exact
// mount line, that route file is not owned by this task).
const config = require('../config');
const logger = require('../lib/logger');
const aiBudgetRepo = require('../repositories/aiBudget');
const { pool } = require('../db');

// Bucketed by UTC calendar day — deliberately not the server's local
// timezone, so the budget resets at the same real-world instant regardless
// of which region a given deploy runs in.
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Midnight UTC immediately after `day` (YYYY-MM-DD) — when the 429's
// `resetAt` tells the client the budget rolls over.
function resetAtFor(day) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * @param {number} userId
 * @returns {Promise<{exceeded:boolean, used:number, limit:number, day:string, resetAt:string}>}
 */
async function checkBudget(userId) {
  const day = todayUTC();
  const usage = await aiBudgetRepo.getUsageForDay(userId, day);
  const used = Number(usage.prompt_tokens || 0) + Number(usage.completion_tokens || 0);
  const limit = config.AI_DAILY_TOKEN_BUDGET;
  return { exceeded: used >= limit, used, limit, day, resetAt: resetAtFor(day) };
}

// Records one OpenAI call's usage against today's running total. `usage` is
// the raw `usage` object OpenAI returns on a chat.completions response
// (prompt_tokens/completion_tokens/total_tokens, optionally
// prompt_tokens_details.cached_tokens) — tolerant of all of it being
// missing (e.g. a mocked response in tests, or a provider hiccup) since
// under-counting a budget is far less harmful than throwing and failing the
// whole request over bookkeeping.
//
// OpenAI bills a cached prompt token (one it's already seen recently — the
// coach's system prompt + tool schemas are the same ~12k tokens on every
// call in a conversation, so most of a later turn's prompt is a cache hit)
// at 25% of the normal input price. Counting every prompt token at full
// weight against AI_DAILY_TOKEN_BUDGET charged riders for tokens OpenAI
// itself was charging BikeLab 4x less for — recording the actual billed
// weight here means a long-running conversation costs the budget roughly
// what it costs in real money, not an inflated multiple of it.
function billedPromptTokens(usage) {
  const rawPromptTokens = Number(usage.prompt_tokens) || 0;
  const cachedTokens = Math.min(Number(usage.prompt_tokens_details?.cached_tokens) || 0, rawPromptTokens);
  return Math.round(rawPromptTokens - 0.75 * cachedTokens);
}

async function recordUsage(userId, usage) {
  if (!userId || !usage) return;
  const promptTokens = billedPromptTokens(usage);
  const completionTokens = Number(usage.completion_tokens) || 0;
  if (promptTokens === 0 && completionTokens === 0) return;
  try {
    await aiBudgetRepo.recordUsage(userId, todayUTC(), promptTokens, completionTokens);
  } catch (err) {
    logger.error({ err: err.message }, '[aiBudget] Failed to record usage:');
  }
}

// Admins are exempt from the daily AI budget entirely (T-? coach-
// readiness-budget) — an admin poking at the coach/ai-analysis/goal-
// generation tools for support or QA shouldn't get rate-limited by a budget
// meant for riders. Reuses authMiddleware's req.userRow (already fetched
// is_admin there, for the token_version check every authed request already
// pays for) instead of a second SELECT — the common case on every one of
// these routes, since requireAiBudget is always mounted after
// authMiddleware. Falls back to one indexed SELECT (same as requireAdmin's
// own fallback) for a caller that invokes this without authMiddleware
// having run first, e.g. this module's own unit tests.
async function isAdminUser(req) {
  if (req.userRow) return req.userRow.is_admin === true;
  const userId = req.user?.userId || req.userId;
  if (!userId) return false;
  const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.is_admin === true;
}

// Express middleware — 429s with the standard AI_BUDGET_EXCEEDED shape once
// today's usage is at/over AI_DAILY_TOKEN_BUDGET. Mount AFTER authMiddleware
// (needs req.user.userId) on any OpenAI-backed route. Fails OPEN on a
// budget-check error (e.g. a transient DB hiccup) — a bookkeeping failure
// shouldn't take down the whole AI feature.
async function requireAiBudget(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next();
  try {
    if (await isAdminUser(req)) return next();
    const { exceeded, resetAt } = await checkBudget(userId);
    if (exceeded) {
      return res.status(429).json({ error: 'Daily AI budget exceeded', code: 'AI_BUDGET_EXCEEDED', resetAt });
    }
    next();
  } catch (err) {
    logger.error({ err: err.message }, '[aiBudget] requireAiBudget check failed, allowing request through:');
    next();
  }
}

module.exports = { checkBudget, recordUsage, requireAiBudget, todayUTC };
