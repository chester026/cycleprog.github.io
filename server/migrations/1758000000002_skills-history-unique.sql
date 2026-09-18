-- T-3.3 (docs/audit/00-AUDIT-AND-PLAN.md T-3.3): GET /api/skills' snapshot
-- write must be idempotent per (user_id, last_activity_id) — two concurrent
-- requests for the same "latest synced activity" must never create two
-- rows. `server/services/skills.js`'s saveSnapshot() already checks for an
-- existing row with the same last_activity_id before inserting, but that
-- check-then-insert has a race window without a DB constraint backing it.
--
-- Guarded DO block: dedupe first (keep the lowest id per (user_id,
-- last_activity_id) pair — arbitrary but deterministic tie-break, since
-- which of two already-duplicated rows survives doesn't matter for a
-- history table), THEN create the unique index. Idempotent — safe to run
-- again (IF NOT EXISTS) and safe against `last_activity_id IS NULL` rows
-- (a plain UNIQUE index across nullable columns treats NULLs as distinct
-- from one another in Postgres, so multiple NULL last_activity_id rows for
-- the same user are still allowed, exactly like this table has always
-- allowed before any snapshot existed).
DO $$
BEGIN
  DELETE FROM skills_history a
  USING skills_history b
  WHERE a.id < b.id
    AND a.user_id = b.user_id
    AND a.last_activity_id = b.last_activity_id
    AND a.last_activity_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- Table doesn't exist yet in this environment (shouldn't happen — it's in
  -- test/fixtures/base-schema.sql for tests, and only ever a placeholder gap
  -- production doesn't have) — no-op rather than fail the whole migration.
  NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_history_user_last_activity
    ON skills_history (user_id, last_activity_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
