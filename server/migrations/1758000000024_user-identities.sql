-- Sign-in identities (docs/plans/auth-providers.md §3.1).
--
-- An account stops being "a Strava athlete": a rider signs in with Apple or
-- Google, and one account can hold both. One row per (account, provider).
-- Email + password stays on `users`; Strava stays on `users` too, as a
-- connection rather than an identity.
--
--   provider_user_id — the ID token's `sub`. The only stable key: an email
--     can change, and Apple may hand out a private relay address instead.
--   client_id — the audience the token was issued for (the app's bundle id,
--     or the Services ID on the web). Apple's revoke endpoint must be called
--     with the same one, so it is stored with the refresh token.
--   refresh_token — Apple only, AES-256-GCM (lib/secretBox.js). Kept for one
--     purpose: revoking the grant when the account is deleted.
CREATE TABLE IF NOT EXISTS user_identities (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  provider_user_id TEXT NOT NULL,
  email            TEXT,
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  client_id        TEXT,
  refresh_token    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ,
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

-- Where users.avatar came from. Strava's picture has to go when Strava is
-- disconnected; a Google picture must survive that. Until now Strava was the
-- only writer of the column, hence the backfill.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source TEXT;

UPDATE users SET avatar_source = 'strava' WHERE avatar_source IS NULL AND avatar IS NOT NULL;
