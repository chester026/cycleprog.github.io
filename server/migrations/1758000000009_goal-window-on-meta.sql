-- One deadline per goal (owner decision, 21.09).
--
-- `goals.start_date`/`end_date` were the metric-model replacement for the
-- older `period` enum ('4w'/'3m'/'year'): each sub-goal carried its own
-- window. But a sub-goal is a metric OF its meta-goal, never a separately
-- scheduled thing, and `meta_goals.target_date` already existed as the
-- goal's deadline — so every goal had two deadlines that nothing kept in
-- sync. Extending a goal moved `target_date` (what the card shows) while
-- progress kept filtering on the untouched sub-goal `end_date`, so the goal
-- silently stopped counting new rides and looked frozen.
--
-- The window is now [meta_goals.created_at, meta_goals.target_date],
-- injected at read time by services/goals.js's `goalWindow`.

-- Carry the deadline over before dropping the column it lives in. Only for
-- meta-goals that have none of their own: a target_date the rider or the
-- coach actually set wins over whatever the sub-goals were seeded with.
-- Without this, a goal whose deadline only ever existed on its sub-goals
-- would come out of this migration with an open-ended window and start
-- counting the rider's whole history.
-- Guarded so the whole file stays idempotent like every other migration
-- here: after the DROP below, `goals.end_date` no longer exists and this
-- statement would be a parse error, not a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'goals' AND column_name = 'end_date'
  ) THEN
    UPDATE meta_goals mg
       SET target_date = sub.max_end,
           updated_at = NOW()
      FROM (
        SELECT meta_goal_id, MAX(end_date) AS max_end
          FROM goals
         WHERE meta_goal_id IS NOT NULL AND end_date IS NOT NULL
         GROUP BY meta_goal_id
      ) sub
     WHERE mg.id = sub.meta_goal_id
       AND mg.target_date IS NULL;
  END IF;
END $$;

ALTER TABLE goals DROP COLUMN IF EXISTS start_date;
ALTER TABLE goals DROP COLUMN IF EXISTS end_date;
