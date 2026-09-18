-- Impact-on-Goals cache (activity_meta_goals_progress) had no FK to
-- meta_goals in production, so rows outlived their meta goal and the
-- cached path then answered "no goals" forever (services/activities.js
-- getMetaGoalsProgressForActivity). Remove the orphans and make sure it
-- can't happen again. Guarded: the constraint may already exist on a DB
-- created from the test fixture.
DELETE FROM activity_meta_goals_progress p
 WHERE NOT EXISTS (SELECT 1 FROM meta_goals mg WHERE mg.id = p.meta_goal_id);

DO $$ BEGIN
  ALTER TABLE activity_meta_goals_progress
    ADD CONSTRAINT activity_meta_goals_progress_meta_goal_fk
    FOREIGN KEY (meta_goal_id) REFERENCES meta_goals(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
