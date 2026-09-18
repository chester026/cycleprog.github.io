-- T-4.2 (S-36 index audit, docs/audit/00-AUDIT-AND-PLAN.md). Adds indexes for
-- hot lookups that weren't covered by 1758000000001_startup-iife.sql (or the
-- narrower unique indexes added since — 1758000000002/1758000000004): those
-- migrations already cover most user_id-scoped tables (skills_history,
-- meta_goals, goals, coach_messages/conversations, synced_activities,
-- synced_bikes, calendar_events, user_profiles, oura_daily_data, ...) and
-- activity_analysis (user_id, strava_id, kind); this migration only adds the
-- ones that audit found still missing:
--
--   * users(verification_token) — repositories/users.js verifyEmailToken()
--     does `WHERE verification_token = $1` with no index backing it at all
--     (not even the implicit one a PRIMARY/UNIQUE gives id/email/strava_id).
--   * activity_meta_goals_progress(user_id, activity_id) — repositories/
--     activities.js's per-activity meta-goal-progress cache read is
--     `WHERE user_id = $1 AND activity_id = $2`. The table's existing index
--     (idx_activity_meta_progress_user, from 1758000000001) is on
--     (user_id, meta_goal_id), a different column pair — doesn't help this
--     lookup.
--   * analytics_snapshots(user_id, last_activity_id) — services/
--     analyticsSnapshot.js's idempotency check
--     (`WHERE user_id = $1 AND last_activity_id = $2 AND snapshot_date =
--     CURRENT_DATE`) and aiCoach.js's equivalent read both filter on this
--     pair. The existing idx_analytics_snapshots_user index is
--     (user_id, snapshot_date DESC) — again a different pair, doesn't help.
--
-- Plain (non-CONCURRENT) CREATE INDEX: node-pg-migrate wraps each migration
-- in a transaction and CREATE INDEX CONCURRENTLY cannot run inside one
-- (Postgres error 25001). All three tables are small today (this app has no
-- production traffic yet), so the brief exclusive lock a plain CREATE INDEX
-- takes is a non-issue; revisit with CONCURRENTLY-outside-a-migration
-- tooling if these tables ever grow large enough for that lock to matter.
CREATE INDEX IF NOT EXISTS idx_users_verification_token
  ON users (verification_token);

CREATE INDEX IF NOT EXISTS idx_activity_meta_progress_user_activity
  ON activity_meta_goals_progress (user_id, activity_id);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_user_last_activity
  ON analytics_snapshots (user_id, last_activity_id);
