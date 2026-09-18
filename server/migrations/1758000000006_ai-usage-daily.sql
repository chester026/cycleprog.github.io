-- T-4.4 (audit S-31) — per-user daily OpenAI token budget. One row per
-- (user_id, day); services/aiBudget.js upserts into it after every
-- OpenAI-backed call (coach chat, ai-analysis, meta-goals ai-generate) and
-- GET /api/admin/ai-usage aggregates across it. `day` is a plain DATE (UTC
-- calendar day, see services/aiBudget.js todayUTC()) rather than a
-- timestamp — usage is bucketed per calendar day, not per rolling window.
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Admin usage report (GET /api/admin/ai-usage?days=N) aggregates over a
-- recent day range across all users — index on day alone (not (user_id,
-- day), already covered by the PK) speeds up that range scan.
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_day ON ai_usage_daily (day);
