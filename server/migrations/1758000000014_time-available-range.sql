-- The production table carries CHECK (time_available BETWEEN 1 AND 10) from
-- the original schema, and the column is INTEGER. Both predate the
-- experience-level guidance ("advanced 12+ h") and blocked a beta tester
-- from saving 25 h/week even after services/userProfile.js started
-- accepting 1–40 (06.10.2026) — the API answered 500 from the constraint
-- instead of the validation's 400. The service is now the single place the
-- range lives; the DB keeps only a sanity bound. NUMERIC(4,1) allows 7.5 h.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_time_available_check;
ALTER TABLE user_profiles ALTER COLUMN time_available TYPE NUMERIC(4,1) USING time_available::numeric;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_time_available_check CHECK (time_available IS NULL OR (time_available >= 0 AND time_available <= 100));
