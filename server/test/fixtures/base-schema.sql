-- temporary — replaced by the real baseline dump; delete when
-- 1758000000000_baseline.sql is real (see that file's header and
-- docs/audit/00-AUDIT-AND-PLAN.md T-1.7/T-1.4).
--
-- 1758000000000_baseline.sql is still a placeholder — none of these "base"
-- tables (created by hand against production over the years, never in
-- code) exist anywhere in this codebase's migrations. Without them, a fresh
-- database only gets what migrations/1758000000001_startup-iife.sql creates
-- (oauth_states, auth_codes, meta_goals/goals EXTRA columns via ALTER,
-- analytics_snapshots, achievements, coach_*, synced_*, calendar_events,
-- oura_daily_data, users EXTRA columns) — every ALTER TABLE ... ADD COLUMN
-- in that file silently no-ops if its base table doesn't exist yet, and
-- every ALTER on `users`/`goals`/`meta_goals` needs those tables to already
-- exist.
--
-- This file is applied (by server/test/integration/setup.js) BEFORE
-- runMigrations(), so 1758000000001_startup-iife.sql's ALTERs land on real
-- tables and its FK-bearing CREATE TABLEs (referencing users/meta_goals)
-- succeed.
--
-- Columns below were inferred from how server.js/routes/*.js/
-- recommendations/*.js actually SELECT/INSERT/UPDATE these tables (grepped
-- every `FROM <table>`, `INSERT INTO <table> (...)`, `UPDATE <table> SET`),
-- plus md/GOALS_SYSTEM.md's documented `goals` DDL. Flagged inline wherever
-- the real production column type/nullability could plausibly differ (this
-- was never captured in code, so there is no ground truth to check against
-- here).
--
-- Every statement is idempotent (`IF NOT EXISTS`) so re-running this against
-- an already-provisioned database (or one where the real baseline dump has
-- since replaced it) is a safe no-op.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- strava_athlete_id, is_admin, oura_* are added by
-- 1758000000001_startup-iife.sql's ALTER TABLE users ADD COLUMN IF NOT
-- EXISTS — deliberately NOT duplicated here.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  avatar TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  verification_token_expires TIMESTAMPTZ,
  strava_id BIGINT,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_expires_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- meta_goals (created before `goals`, which FKs to it)
-- ---------------------------------------------------------------------------
-- tier, focus_tags are added by 1758000000001_startup-iife.sql.
CREATE TABLE IF NOT EXISTS meta_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_context JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
-- source/metric/start_date/end_date are added by
-- 1758000000001_startup-iife.sql, which also DROPs the historical NOT NULL
-- on goal_type/period (md/GOALS_SYSTEM.md's documented DDL has `goal_type
-- VARCHAR NOT NULL` — kept NOT NULL here to match, and it's exactly the
-- constraint that migration's DO-block guard exists to drop).
-- UNCERTAIN: `priority`/`reasoning` (used only by the AI meta-goal
-- sub-goal INSERTs at server.js ~3490/3519) — types guessed as
-- INTEGER/TEXT from how they're used (`subGoal.priority || 3`, a short
-- string).
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  meta_goal_id INTEGER REFERENCES meta_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value NUMERIC,
  current_value NUMERIC,
  unit TEXT,
  goal_type TEXT NOT NULL,
  period TEXT DEFAULT '4w',
  hr_threshold INTEGER DEFAULT 160,
  duration_threshold INTEGER DEFAULT 120,
  vo2max_value NUMERIC,
  priority INTEGER DEFAULT 3,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- rides (legacy calendar surface — still live behind /api/rides, backfilled
-- into calendar_events by 1758000000001_startup-iife.sql)
-- ---------------------------------------------------------------------------
-- UNCERTAIN: `start` — read as a plain start-of-ride instant
-- (server.js:613/658 INSERT `start` from a client-supplied value, and
-- 1758000000001_startup-iife.sql's backfill does `r.start::date`, i.e. it
-- must at least cast cleanly to DATE) — TIMESTAMPTZ chosen so both a
-- date-only and a datetime input work.
CREATE TABLE IF NOT EXISTS rides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  location TEXT,
  location_link TEXT,
  details TEXT,
  start TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- checklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  section TEXT,
  item TEXT,
  checked BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- events (user-created calendar "badges"/reminders — distinct from
-- calendar_events, see server.js EVENTS MANAGEMENT ENDPOINTS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  start_date DATE NOT NULL,
  background_color TEXT DEFAULT '#274DD3',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
-- UNCERTAIN: `time_available`/`workouts_per_week` — server code treats them
-- as small numbers (recommendations/index.js defaults 5/5); NUMERIC/INTEGER
-- chosen respectively but either could plausibly be the other.
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  experience_level TEXT,
  time_available NUMERIC,
  workouts_per_week INTEGER,
  show_recommendations BOOLEAN DEFAULT FALSE,
  preferred_training_types TEXT[],
  preferred_days TEXT[],
  seasonal_preferences JSONB,
  gender TEXT,
  height NUMERIC,
  weight NUMERIC,
  age INTEGER,
  bike_weight NUMERIC,
  hr_zones JSONB,
  max_hr INTEGER,
  resting_hr INTEGER,
  lactate_threshold INTEGER,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- user_images
-- ---------------------------------------------------------------------------
-- UNCERTAIN: `position` — imagekit-config.js's saveImageMetadata passes it
-- straight through from the caller with no cast; TEXT chosen since it looks
-- like a slot key (e.g. "front"/"side"), not necessarily numeric.
CREATE TABLE IF NOT EXISTS user_images (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  image_type TEXT,
  position TEXT,
  file_id TEXT,
  file_url TEXT,
  file_path TEXT,
  file_name TEXT,
  original_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ai_analysis_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_analysis_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, hash)
);

-- ---------------------------------------------------------------------------
-- skills_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  climbing NUMERIC,
  sprint NUMERIC,
  endurance NUMERIC,
  tempo NUMERIC,
  power NUMERIC,
  consistency NUMERIC,
  last_activity_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- custom_training_plans
-- ---------------------------------------------------------------------------
-- UNCERTAIN: `training_details` — recommendations/index.js writes
-- JSON.stringify(details) into it in the "simple training" branch but
-- JSON.stringify(parts) into the sibling `training_parts` column in the
-- "composite" branch; both modeled as JSONB on that basis.
CREATE TABLE IF NOT EXISTS custom_training_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  training_type TEXT,
  training_name TEXT,
  training_parts JSONB,
  training_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, day_key)
);

-- ---------------------------------------------------------------------------
-- generated_weekly_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generated_weekly_plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  plan_data JSONB,
  analysis_data JSONB,
  priorities_data JSONB,
  goals_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start_date)
);

-- ---------------------------------------------------------------------------
-- activity_meta_goals_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_meta_goals_progress (
  id SERIAL PRIMARY KEY,
  activity_id BIGINT,
  meta_goal_id INTEGER REFERENCES meta_goals(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  progress_before NUMERIC,
  progress_after NUMERIC,
  contributions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meta_goal_id, user_id)
);
