-- Garmin Connect as a ride source (docs/plans/garmin-connect-api.md).
--
-- Not to be confused with garmin_devices (migration 015): that table pairs a
-- bike computer running the BikeLab Connect IQ app, so the computer can READ
-- BikeLab. These two tables are the other direction — rides recorded by a
-- Garmin device, coming INTO BikeLab from Garmin Connect.
--
-- garmin_connections — one row per rider who linked a Garmin account.
--   transport 'personal' = the owner's Personal API key (development, one
--   account, pulled by scripts/garmin-sync.js); 'oauth' = the Developer
--   Program flow real users will go through (push webhooks). Everything
--   below the transport is the same for both.
--   garmin_user_id is UNIQUE: one Garmin account feeds one BikeLab account.
CREATE TABLE IF NOT EXISTS garmin_connections (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  garmin_user_id TEXT NOT NULL UNIQUE,
  transport      TEXT NOT NULL CHECK (transport IN ('personal', 'oauth')),
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at   TIMESTAMPTZ
);

-- garmin_activities — one row per ride, everything BikeLab keeps about it.
--
-- What is stored, and what is not (owner decision 2026-11-10): the ride's
-- summary, the results derived from its per-second data, and a chart-sized
-- downsample of that data live here forever — about 11 KB a ride. The
-- per-second recording itself (the FIT file, ~0.3 MB a ride) is NOT stored:
-- at 1000 riders with years of history it would outgrow the database many
-- times over, and nothing reads it twice — every number that needs it is
-- computed once, at ingest.
--
--   summary columns — named and unit-ed like the Strava activity object the
--     rest of the server already speaks (metres, seconds, m/s, watts), so a
--     Garmin ride and a Strava ride can be read by the same code.
--   provider — Garmin's own figures for the ride (its TSS/IF/NP, the FTP set
--     on the device that day, training effect, device and sensors). Kept
--     apart from BikeLab's numbers so the two are never mixed up.
--   analysis — BikeLab's derived results, the same shapes activity_analysis
--     holds per kind for Strava rides: best efforts, the bpm histogram, the
--     ride-power breakdown. Computed WITHOUT an FTP, plus a watts histogram,
--     so IF/TSS/zones can be worked out for any FTP later without the raw
--     data. analysis_version lets a calc change find the rows to redo.
--   chart — brotli-compressed JSON of the downsampled streams (Strava's
--     key_by_type shape) for the ride screen's charts and map.
--
-- The FK points at garmin_connections, not users: disconnecting Garmin
-- deletes the connection row and, through the cascade, every ride that came
-- through it — Garmin's API terms require exactly that.
CREATE TABLE IF NOT EXISTS garmin_activities (
  user_id              INTEGER NOT NULL REFERENCES garmin_connections(user_id) ON DELETE CASCADE,
  garmin_activity_id   BIGINT  NOT NULL,
  name                 TEXT,
  type                 TEXT    NOT NULL,
  sub_sport            TEXT,
  start_date           TIMESTAMPTZ NOT NULL,
  utc_offset_s         INTEGER,
  distance             REAL,
  moving_time          INTEGER,
  elapsed_time         INTEGER,
  total_elevation_gain REAL,
  average_speed        REAL,
  max_speed            REAL,
  average_heartrate    REAL,
  max_heartrate        REAL,
  average_cadence      REAL,
  average_watts        REAL,
  max_watts            REAL,
  weighted_average_watts REAL,
  kilojoules           REAL,
  device_watts         BOOLEAN NOT NULL DEFAULT FALSE,
  average_temp         REAL,
  device_name          TEXT,
  provider             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  analysis             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  analysis_version     INTEGER NOT NULL DEFAULT 1,
  chart                BYTEA,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, garmin_activity_id)
);

-- Every reader lists a rider's rides newest-first or by date window.
CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_start ON garmin_activities (user_id, start_date DESC);
