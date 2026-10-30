-- Garmin Connect IQ bridge (docs/plans/garmin-connect-iq.md §2.1).
--
-- One row per pairing attempt started by a bike computer. Lifecycle:
--   start   → code + poll_key issued, user_id NULL, expires_at = now + 10 min
--   confirm → the rider types the code into the app; user_id set
--   poll    → the device polls with poll_key; once user_id is set the row is
--             marked consumed and a device JWT is minted with `jti = token_id`
-- After consumption the row IS the device record: `revoked_at` is what
-- middleware/garmin.js checks on every device request, so unpairing from the
-- phone (DELETE /api/garmin/devices/:id) or from the device
-- (DELETE /api/garmin/pair) kills a token long before its 1-year expiry.
-- Unconsumed, expired rows are deleted opportunistically in pair/start.
CREATE TABLE IF NOT EXISTS garmin_devices (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  device_name   TEXT,
  code          CHAR(6) NOT NULL,
  poll_key      TEXT NOT NULL UNIQUE,
  token_id      TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

-- A code must be unique only among live, unconsumed attempts — the same six
-- digits can be reused once an attempt is consumed or expired.
CREATE UNIQUE INDEX IF NOT EXISTS garmin_devices_live_code_idx
  ON garmin_devices (code) WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS garmin_devices_user_idx ON garmin_devices (user_id) WHERE consumed_at IS NOT NULL;
