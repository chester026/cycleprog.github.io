-- Garmin health data, one row per rider per day (docs/plans/
-- garmin-connect-api.md §4): last night's sleep and HRV plus that day's
-- resting heart rate, stress and Body Battery — what a Garmin watch knows
-- about recovery, next to the rides in garmin_activities.
--
-- `day` is Garmin's calendar date: the sleep and HRV on it are the night the
-- rider WOKE UP from that morning, the daytime figures are that day's. The
-- same convention oura_daily_data uses, so the two can be read side by side.
-- Today's row is partial until the day ends (stress and Body Battery keep
-- moving), which is why a sync always re-fetches the most recent days.
--
-- Normalised columns only, no raw payload: Garmin's JSON differs per
-- transport (the Personal API's web-gateway shapes today, the Developer
-- Program's push summaries later), and this row is what both map into.
-- Every column is nullable — a rider who doesn't sleep in the watch has
-- daytime figures and no sleep, and a day with nothing at all gets no row.
--
-- Like garmin_activities, the FK points at garmin_connections: disconnecting
-- deletes the rider's Garmin health data with the connection, as Garmin's
-- terms require.
CREATE TABLE IF NOT EXISTS garmin_health_days (
  user_id              INTEGER NOT NULL REFERENCES garmin_connections(user_id) ON DELETE CASCADE,
  day                  DATE    NOT NULL,
  -- Sleep (the night ending on `day`), seconds.
  sleep_seconds        INTEGER,
  deep_sleep_seconds   INTEGER,
  light_sleep_seconds  INTEGER,
  rem_sleep_seconds    INTEGER,
  awake_seconds        INTEGER,
  nap_seconds          INTEGER,
  sleep_score          INTEGER,
  sleep_avg_hr         REAL,
  sleep_avg_stress     REAL,
  sleep_respiration    REAL,
  spo2_avg             REAL,
  -- Overnight HRV, ms; `hrv_status` is Garmin's own word for where last
  -- night sits against the rider's baseline (BALANCED, UNBALANCED, LOW, …).
  hrv_last_night_ms    REAL,
  hrv_weekly_avg_ms    REAL,
  hrv_status           TEXT,
  -- Heart rate over the day, bpm.
  resting_hr           INTEGER,
  min_hr               INTEGER,
  max_hr               INTEGER,
  -- Garmin stress, 0–100, and the seconds spent in each band.
  stress_avg           INTEGER,
  stress_max           INTEGER,
  stress_qualifier     TEXT,
  stress_rest_seconds  INTEGER,
  stress_low_seconds   INTEGER,
  stress_medium_seconds INTEGER,
  stress_high_seconds  INTEGER,
  -- Body Battery, 0–100: the day's peak (≈ the charge after the night) and
  -- trough, and how much was charged and drained.
  body_battery_high    INTEGER,
  body_battery_low     INTEGER,
  body_battery_charged INTEGER,
  body_battery_drained INTEGER,
  respiration_avg      REAL,
  steps                INTEGER,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
