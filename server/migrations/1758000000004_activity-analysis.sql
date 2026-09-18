-- T-3.6 (docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/
-- 04-cross-layer.md §4.6, docs/audit/layers/02-bikelabapp.md A-04):
-- server-computed, cached per-activity analysis results (FTP/high-intensity
-- interval analysis today; `kind` leaves room for future analyses of the
-- same shape without another migration). Streams themselves are never
-- cached server-side (they're re-fetched from Strava through
-- services/strava/activities.js's existing activities cache/backoff), but
-- computing `analyzeHighIntensityTime` over a whole ride's per-second
-- heart-rate stream is the expensive part worth persisting, and this is
-- what makes `GET /api/activities/:id/ftp-analysis` and the batch
-- `GET /api/analytics/ftp` cheap on every call after the first.
--
-- UNIQUE (user_id, strava_id, kind): one cached result per user per
-- activity per analysis kind — a second computation for the same triple
-- overwrites (see server/services/ftpAnalysis.js's upsert), it never
-- duplicates.
CREATE TABLE IF NOT EXISTS activity_analysis (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  result JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_analysis_user_strava_kind
    ON activity_analysis (user_id, strava_id, kind);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
