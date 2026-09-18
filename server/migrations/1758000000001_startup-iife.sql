-- Everything server.js's startup IIFE (previously lines ~156-557) and
-- achievements.js's setupAchievementTables() used to run against the
-- database on every single process boot — T-1.4, docs/audit/00-AUDIT-AND-
-- PLAN.md, S-29. Moved here verbatim (statement order preserved) so it runs
-- exactly once per environment (tracked in `pgmigrations`) instead of on
-- every boot of every instance.
--
-- Every statement below was already idempotent (`IF NOT EXISTS` / `ADD
-- COLUMN IF NOT EXISTS` / guarded `UPDATE ... WHERE ...`) before this move —
-- that's unchanged, it's what makes it safe for this migration to run
-- against the already-populated production database the first time
-- `npm run migrate` is ever invoked (see migrations/1758000000000_baseline.sql).
--
-- achievements.achievements seed data (ACHIEVEMENT_DEFINITIONS) is NOT here —
-- that's `seedAchievements()`, still called from server.js at startup
-- (idempotent via `ON CONFLICT (key) DO UPDATE`), not schema, so it doesn't
-- belong in a migration.

-- --- from server.js IIFE ---

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  user_id INTEGER NULL,
  client TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bike_component_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  bike_id VARCHAR(64) NOT NULL,
  component VARCHAR(32) NOT NULL,
  reset_at TIMESTAMP DEFAULT NOW(),
  reset_km NUMERIC DEFAULT 0,
  source VARCHAR(16) DEFAULT 'manual'
);

ALTER TABLE bike_component_resets ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'manual';

-- Custom gear labels (see BikeGarageScreen.tsx) — lets a rider attach their
-- actual product name to either a whole component GROUP or a single
-- COMPONENT card within a group.
CREATE TABLE IF NOT EXISTS bike_component_labels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  bike_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_key VARCHAR(32) NOT NULL,
  custom_name VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, bike_id, target_type, target_key)
);

ALTER TABLE meta_goals ADD COLUMN IF NOT EXISTS tier VARCHAR(16) DEFAULT 'base';

-- Theme tags (climbing/endurance/ftp/etc — see aiCoach.js FOCUS_TAGS).
ALTER TABLE meta_goals ADD COLUMN IF NOT EXISTS focus_tags TEXT[] DEFAULT '{}';

-- Declarative goal-metric redesign (see md/GOALS_REDESIGN_PLAN_FINAL.md +
-- BikeLabApp/GOALS_REDESIGN_SPEC.md): `source`/`metric` replace the old
-- goal_type enum, `start_date`/`end_date` replace the old `period` enum.
-- goal_type/period stay on the table as legacy fallback columns.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS metric JSONB;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS end_date DATE;

-- CRITICAL: the original schema (md/GOALS_SYSTEM.md) has `goal_type VARCHAR
-- NOT NULL` — a leftover from when it was a mandatory enum. Every new
-- metric-based sub-goal deliberately leaves goal_type NULL, so without
-- dropping this constraint every new-style sub-goal INSERT fails with a NOT
-- NULL violation. Idempotent via DO-block guard; safe even if already
-- dropped (ALTER COLUMN ... DROP NOT NULL itself has no IF EXISTS form).
DO $$
BEGIN
  BEGIN
    ALTER TABLE goals ALTER COLUMN goal_type DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    -- already nullable, or column/table doesn't exist yet
    NULL;
  END;
END
$$;

-- Same story for `period` — the live DB has it NOT NULL too. New-style
-- sub-goals leave period NULL in favor of start_date/end_date.
DO $$
BEGIN
  BEGIN
    ALTER TABLE goals ALTER COLUMN period DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  last_activity_id BIGINT,
  avg_power NUMERIC, max_power NUMERIC, min_power NUMERIC,
  avg_hr NUMERIC, max_hr NUMERIC, min_hr NUMERIC,
  avg_speed NUMERIC, max_speed NUMERIC, min_speed NUMERIC,
  avg_cadence NUMERIC, max_cadence NUMERIC, min_cadence NUMERIC,
  vo2max NUMERIC,
  activities_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- --- from achievements.js setupAchievementTables() ---

CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  key VARCHAR(60) UNIQUE NOT NULL,
  category VARCHAR(30) NOT NULL,
  tier VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(10),
  metric VARCHAR(50) NOT NULL,
  threshold NUMERIC NOT NULL,
  condition_type VARCHAR(30) NOT NULL,
  sort_order INT DEFAULT 0,
  extra JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migrate: add extra column if missing (table may have been created before
-- this column existed).
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  current_value NUMERIC DEFAULT 0,
  unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMP,
  trigger_activity_id BIGINT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON user_achievements(user_id, unlocked);

-- --- back to server.js IIFE ---

-- AI Coach chat history. Note: ids are generated app-side via uuidv4() on
-- INSERT (not DB DEFAULT) so this doesn't depend on the pgcrypto extension
-- being enabled.
CREATE TABLE IF NOT EXISTS coach_conversations (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags a conversation with the Strava activity it ended up analyzing.
ALTER TABLE coach_conversations ADD COLUMN IF NOT EXISTS activity_id BIGINT;

CREATE TABLE IF NOT EXISTS coach_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  suggestions JSONB,
  token_usage JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Durable mirror of Strava activities/bikes. Strava is still the source of
-- truth — these tables are only ever written as a side effect of a live
-- fetch /api/activities or /api/bikes was already doing.
CREATE TABLE IF NOT EXISTS synced_activities (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id BIGINT NOT NULL,
  name TEXT,
  type VARCHAR(32),
  start_date TIMESTAMPTZ,
  distance NUMERIC,
  moving_time INTEGER,
  elapsed_time INTEGER,
  total_elevation_gain NUMERIC,
  average_speed NUMERIC,
  max_speed NUMERIC,
  average_heartrate NUMERIC,
  max_heartrate NUMERIC,
  average_cadence NUMERIC,
  average_watts NUMERIC,
  max_watts NUMERIC,
  weighted_average_watts NUMERIC,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, strava_id)
);

-- Full Strava activity JSON (T-1.3, docs/audit/00-AUDIT-AND-PLAN.md) — the
-- selected columns above stay as-is, but every consumer of "this user's
-- activities" now reads the full object out of `raw`. NULL for rows synced
-- before this column existed; services/strava/activities.js backfills those
-- the first time a user with any NULL row is read.
ALTER TABLE synced_activities ADD COLUMN IF NOT EXISTS raw JSONB;

CREATE TABLE IF NOT EXISTS synced_bikes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bike_id VARCHAR(64) NOT NULL,
  name TEXT,
  distance_km NUMERIC,
  is_primary BOOLEAN DEFAULT false,
  brand_name TEXT,
  model_name TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, bike_id)
);

-- Replaces the old `rides` table as the AI Coach's calendar surface
-- (CALENDAR_SPEC.md §2). `rides` itself is INTENTIONALLY left alone — it's
-- still live behind /api/rides and merged into /api/activities' "manual
-- activities" feed. calendar_events is a richer, purely-additive table that
-- starts out seeded with a copy of whatever's already in `rides` (see the
-- backfill below).
CREATE TABLE IF NOT EXISTS calendar_events (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'planned_ride',
  title         TEXT NOT NULL,
  description   TEXT,
  location      TEXT,
  location_link TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,
  all_day       BOOLEAN DEFAULT true,
  start_time    TIME,
  end_time      TIME,
  completed     BOOLEAN DEFAULT false,
  source        TEXT DEFAULT 'user',
  coach_conversation_id UUID REFERENCES coach_conversations(id) ON DELETE SET NULL,
  apple_event_id TEXT,
  migrated_from_ride_id INTEGER,
  goal_id       INTEGER REFERENCES meta_goals(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- For databases where calendar_events already existed before goal_id was
-- added — CREATE TABLE IF NOT EXISTS above is a no-op on those, so the
-- column needs its own idempotent ALTER. Links an event to the meta_goal it
-- is training toward (nullable — most events aren't part of a goal-tracked
-- plan: rest days, purchases, one-off notes).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS goal_id INTEGER REFERENCES meta_goals(id) ON DELETE SET NULL;

-- One-time-per-row backfill from the legacy `rides` table, guarded by
-- migrated_from_ride_id so re-running it only copies rows that haven't been
-- copied yet.
INSERT INTO calendar_events
  (user_id, type, title, location, location_link, description, start_date, source, migrated_from_ride_id)
SELECT r.user_id, 'planned_ride', r.title, r.location, r.location_link, r.details, r.start::date, 'user', r.id
FROM rides r
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_events ce WHERE ce.migrated_from_ride_id = r.id
);

-- Permanent Strava identity anchor — see idx_users_strava_athlete comment
-- below for why this exists separately from strava_id. Backfill copies the
-- current strava_id for anyone already connected, so the anchor is in place
-- before the next unlink/relink cycle for existing users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_athlete_id BIGINT;
UPDATE users SET strava_athlete_id = strava_id WHERE strava_id IS NOT NULL AND strava_athlete_id IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Oura is a data SOURCE only (readiness/sleep/HRV), never how someone logs
-- in or creates an account — that stays Strava-only. Just extra nullable
-- columns on the existing users row, keyed to whichever Strava-authenticated
-- user connected Oura. oura_user_id is Oura's personal_info id.
ALTER TABLE users ADD COLUMN IF NOT EXISTS oura_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oura_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oura_expires_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oura_user_id TEXT;

-- Cached mirror of Oura's daily readiness/sleep/activity — Oura is the
-- source of truth, this table just survives restarts/deploys. Populated by
-- ouraService.fetchAndCacheOuraData.
CREATE TABLE IF NOT EXISTS oura_daily_data (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  readiness_score INTEGER,
  sleep_score INTEGER,
  activity_score INTEGER,
  total_sleep_hours NUMERIC,
  average_hrv NUMERIC,
  resting_heart_rate NUMERIC,
  temperature_deviation NUMERIC,
  raw JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_oura_daily_data_user_day ON oura_daily_data (user_id, day DESC);

-- min_heart_rate — Oura's `sleep` endpoint's `lowest_heart_rate` (the true
-- minimum HR observed during the period), distinct from resting_heart_rate
-- above. Added after the table already existed in prod, so it needs its own
-- ALTER rather than living in the CREATE TABLE above.
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS min_heart_rate NUMERIC;

-- daily_stress / daily_resilience / daily_spo2 — three more Oura "daily"
-- endpoints (see ouraService.fetchAndCacheOuraData). SpO2 needs the separate
-- spo2Daily OAuth scope and is Gen-3-ring-only, so its columns will
-- legitimately stay NULL for a lot of riders — that's expected, not a bug.
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS stress_high_seconds INTEGER;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS stress_recovery_high_seconds INTEGER;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS stress_day_summary TEXT;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS resilience_level TEXT;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS resilience_sleep_recovery NUMERIC;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS resilience_daytime_recovery NUMERIC;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS resilience_stress NUMERIC;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS spo2_average NUMERIC;
ALTER TABLE oura_daily_data ADD COLUMN IF NOT EXISTS breathing_disturbance_index NUMERIC;

-- Indexes for query performance at scale. Each wrapped so one missing table
-- (e.g. a base table not yet created by migrations/1758000000000_baseline.sql
-- in a fresh environment) doesn't abort the whole migration — matches the
-- try/catch-per-statement behaviour this had in server.js.
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_rides_user_start ON rides (user_id, start DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals (user_id, created_at DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_goals_meta_goal ON goals (meta_goal_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_meta_goals_user ON meta_goals (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_checklist_user_section ON checklist (user_id, section); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_events_user ON events (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cache_user_hash ON ai_analysis_cache (user_id, hash); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_bike_resets_user_bike ON bike_component_resets (user_id, bike_id, component); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_activity_meta_progress_user ON activity_meta_goals_progress (user_id, meta_goal_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_users_strava ON users (strava_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email); EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- strava_athlete_id is a permanent copy of the Strava numeric athlete id —
-- unlike strava_id (nulled by /api/unlink_strava so the UI can show
-- "disconnected"), this one is never cleared. It's the only reliable anchor
-- for reuniting a re-login with the right account: email is frequently
-- withheld by Strava (NULL) and name is not unique.
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_users_strava_athlete ON users (strava_athlete_id) WHERE strava_athlete_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id, unlocked); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_plans_user_week ON generated_weekly_plans (user_id, week_start_date); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_skills_history_user ON skills_history (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_user_images_user ON user_images (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_user ON analytics_snapshots (user_id, snapshot_date DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coach_messages_conv ON coach_messages (conversation_id, created_at); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coach_conversations_user ON coach_conversations (user_id, updated_at DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_coach_conversations_activity ON coach_conversations (user_id, activity_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_synced_activities_user_date ON synced_activities (user_id, start_date DESC); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_synced_bikes_user ON synced_bikes (user_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events (user_id, start_date); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_migrated ON calendar_events (migrated_from_ride_id) WHERE migrated_from_ride_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_calendar_events_apple ON calendar_events (user_id, apple_event_id) WHERE apple_event_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_calendar_events_goal ON calendar_events (goal_id) WHERE goal_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_meta_goals_focus_tags ON meta_goals USING GIN (focus_tags); EXCEPTION WHEN OTHERS THEN NULL; END $$;
