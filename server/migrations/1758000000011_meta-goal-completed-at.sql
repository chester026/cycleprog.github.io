-- When a meta-goal was actually completed (goal share recap, BikeLabApp's
-- GoalShareStudio). Until now the only trace was `updated_at`, which is a
-- poor stand-in: the coach's update_goal path never touched it at all, and
-- 1758000000009 bumped it to NOW() for every goal whose deadline it carried
-- over — so "when did I finish this" had no reliable answer.
--
-- Written by both status writers (repositories/goals.js updateMetaGoal and
-- aiCoach.js update_goal): set on the active -> completed transition,
-- cleared if a goal is reopened.
ALTER TABLE meta_goals ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Best-effort backfill for goals completed before this column existed:
-- updated_at is the closest thing we have. Only fills NULLs, so re-running
-- is a no-op.
UPDATE meta_goals
   SET completed_at = COALESCE(updated_at, created_at)
 WHERE status = 'completed' AND completed_at IS NULL;
