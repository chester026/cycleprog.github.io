-- T-4.5 auth hardening (audit S-13 token revocation, S-14 refresh tokens,
-- S-27 email-change re-verification / stale-session invalidation, A-05
-- password reset without user enumeration).
--
-- Every column/table below is additive — no existing column/table is
-- touched, so clients holding a JWT minted before this migration keep
-- working unmodified: their token simply has no `tv` claim, and
-- middleware/auth.js treats a missing `tv` as 0, which is `token_version`'s
-- DEFAULT below, so nothing is invalidated by deploying this alone.

-- Bumped on: password reset (services/auth.js resetPassword), account
-- deletion is covered separately (deleting the `users` row itself makes
-- middleware/auth.js's per-request SELECT come back empty, which it already
-- treats as a 401 — see that file), admin delete (routes/admin.js's
-- existing cascade delete, same reasoning), and the new
-- POST /api/auth/logout-all. Every session JWT carries the token_version it
-- was issued under as its `tv` claim; middleware/auth.js 401s whenever that
-- no longer matches the row's current value, which is what makes a bump
-- invalidate every previously-issued token at once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Password reset (POST /api/forgot-password, /api/reset-password). Two
-- columns rather than a separate `password_resets` table: a user only ever
-- has one live reset request at a time (a fresh /forgot-password request
-- just overwrites the previous token), so a table would only add a join for
-- no benefit — see services/auth.js's forgotPassword/resetPassword. Only
-- the SHA-256 hash of the reset token is ever stored, never the raw token
-- (same pattern as refresh_tokens.token_hash below) — a stolen row from a DB
-- dump can't be used to reset anyone's password.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Opt-in refresh tokens (additive — a client that never sends `refreshToken`
-- back just keeps re-logging-in every ACCESS_TOKEN_TTL like today; this does
-- not shorten or otherwise change the access token itself). Only the
-- SHA-256 hash of the opaque `crypto.randomBytes(32)` token is ever stored —
-- the raw value is returned to the client exactly once, at issue/rotation
-- time, and never persisted anywhere.
--
-- `family_id` groups every token descended from one login through however
-- many rotations (see services/auth.js's rotateRefreshToken): presenting a
-- token whose `revoked_at` is already set (i.e. one that was already rotated
-- away, or the whole family already torn down) revokes every token in that
-- family, not just the one reused, since reuse of an already-rotated token
-- means it was likely stolen and the entire chain is suspect (S-14 refresh
-- rotation + reuse detection).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);

-- Every refresh lookup is `WHERE token_hash = $1` (rotate/logout) — unique
-- because a hash collision here would let one token authenticate as
-- another's row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
-- logout-all / password-reset revoke every live token for a user.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
-- Reuse-detected revocation fans out to every token sharing a family.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);
