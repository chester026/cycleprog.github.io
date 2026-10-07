-- The rides that finished a meta-goal ("I did the Garda loop, that closes
-- Half of Island"). Without them a completed goal is just a status flip: the
-- recap/share screens can't show what was ridden and completed_at has no
-- ride to anchor to. Written by POST /api/meta-goals/:id/complete (and the
-- coach's complete_goal tool), cleared by /reopen.
--
-- strava_id is synced_activities.strava_id, the app's Activity.id. That
-- table's key is (user_id, strava_id), so a ride is looked up with user_id
-- as well — meta_goal_rides.user_id is stored for exactly that join and for
-- listing by user. No FK to synced_activities: its rows are pruned and
-- re-synced, which must not silently detach a ride from a finished goal.
CREATE TABLE IF NOT EXISTS meta_goal_rides (
  meta_goal_id INTEGER NOT NULL REFERENCES meta_goals(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  strava_id BIGINT NOT NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meta_goal_id, strava_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_goal_rides_user ON meta_goal_rides (user_id);
