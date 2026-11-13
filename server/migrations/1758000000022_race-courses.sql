-- A race course and the plan made for it (docs/plans/race-plan.md).
--
-- The rider attaches a route file (GPX or FIT) to a coach message; the server
-- reads it into a `Course` (packages/shared/src/calc/course.ts — length,
-- climbing, a 120-point altitude profile, the terrain as climbs / flats /
-- descents) and stores it here. `plan` is the latest `RacePlan`
-- (calc/racePlan.ts — watts, time and W′ per segment, feeds, the blocks a
-- head unit runs) made for it with `plan_options` (bunch or solo, effort,
-- carbs, temperature, language); NULL until the coach has planned the race.
--
-- The file itself is not kept: everything the app uses is in `course`
-- (about 5 KB), and the rider still has the file.
CREATE TABLE IF NOT EXISTS race_courses (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  source VARCHAR(8) NOT NULL,
  course JSONB NOT NULL,
  plan JSONB,
  plan_options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS race_courses_user_idx ON race_courses (user_id, created_at DESC);
