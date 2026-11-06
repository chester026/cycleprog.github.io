-- Raw per-second Strava streams cache (docs/plans/coach-ride-power-breakdown.md §1).
--
-- One row per (user, ride): the gzip of getStreams()'s JSON response
-- (watts/heartrate/cadence/altitude/velocity_smooth/time, key_by_type).
-- Until now ftpAnalysis, hrZones, powerProfile and GET /activities/:id/streams
-- each fetched the same streams from Strava independently — up to 4 GETs per
-- ride against a per-application quota of 300/15 min. With this table a ride
-- costs one GET, ever; every consumer goes through
-- services/strava/activities.js#getStreams which is now cache-through.
--
-- Rows are deleted 30 days after `fetched_at` (services/activityStreams.js
-- STREAMS_RETENTION_DAYS, run from server.js's daily cleanup): the derived
-- results in activity_analysis are what live forever; a ride opened again
-- later is simply re-fetched once. Owner decision 2026-11-06.
CREATE TABLE IF NOT EXISTS activity_streams (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id  BIGINT  NOT NULL,
  streams    BYTEA   NOT NULL,
  keys       TEXT[]  NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, strava_id)
);

-- The retention DELETE scans by fetched_at; a BRIN is enough for an
-- append-mostly, time-ordered table and costs nothing to maintain.
CREATE INDEX IF NOT EXISTS idx_activity_streams_fetched_at ON activity_streams USING BRIN (fetched_at);
