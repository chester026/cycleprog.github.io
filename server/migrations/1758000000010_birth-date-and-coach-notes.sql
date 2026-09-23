-- birth_date replaces the legacy stored `age` (docs/audit T-7.1 follow-up):
-- age computed from a birthday never goes stale, unlike a whole-number age
-- captured once at onboarding. `user_profiles` itself predates every
-- migration (created by test/fixtures/base-schema.sql / the real production
-- baseline), so this only ALTERs it — same pattern as the `users` ALTERs in
-- 1758000000001_startup-iife.sql.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Backfill for existing rows that only ever had `age`: we never captured a
-- real birthday, so July 1st is a deliberate mid-year approximation (splits
-- the difference between "birthday already passed this year" and "not yet"
-- as well as a single guess can). Only fills rows with a stored age and no
-- birth_date yet — re-running this migration is a no-op, and it never
-- overwrites a birth_date a later profile edit/onboarding already set.
UPDATE user_profiles
SET birth_date = make_date(extract(year FROM now())::int - age, 7, 1)
WHERE age IS NOT NULL AND birth_date IS NULL;

-- Coach memory (packages/shared/src/types/coachNotes.ts) — short third-
-- person facts the coach (or the rider, from Profile) records between
-- conversations: preferences, recurring injury/health context, schedule
-- constraints, equipment, motivations. Capped at COACH_NOTES_MAX per user
-- at the service layer (server/services/coachNotes.js), not enforced here.
CREATE TABLE IF NOT EXISTS coach_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(note) <= 160),
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL DEFAULT 'coach',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_notes_user_id ON coach_notes (user_id);
