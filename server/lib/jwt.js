// Single place that signs/verifies this app's JWTs (T-1.1, S-14). Replaces
// 4 copies of `jwt.sign({userId,email,strava_id,name,avatar}, JWT_SECRET,
// {expiresIn:'7d'})` in server.js (/api/auth/exchange, /api/login,
// deauthorize-Strava, change-email) plus routes/oura.js's one-off purpose
// token, all of which used the same secret/algorithm implicitly.
const jwt = require('jsonwebtoken');
const config = require('../config');

// Historical constant, kept for callers/tests that still import it — actual
// signing now uses config.ACCESS_TOKEN_TTL (T-4.5, S-14), which defaults to
// this same '7d' but is independently configurable per-deploy.
const SESSION_TTL = '7d';
const ALGORITHM = 'HS256';

// The 4 `jwt.sign(...)` call sites in server.js all signed exactly this same
// shape (checked by reading each one: /api/auth/exchange ~:633, /api/login
// ~:3835, post-Strava-deauth re-issue ~:5733, change-email re-issue
// ~:6207) — no superset needed, they already agreed.
//
// `tv` (token_version, T-4.5 S-13) is new: it's the value of
// users.token_version at issue time. middleware/auth.js re-reads that
// column on every request and 401s the moment it no longer matches this
// claim, which is what makes bumping token_version (password reset,
// logout-all, account/admin deletion) invalidate every token issued before
// the bump — the token itself is still a validly-signed, unexpired JWT, it
// just no longer verifies as current. `user.token_version` is undefined for
// any caller that only ever fetched a partial row (e.g. legacy call sites
// that pass `{id, email}`); defaulting to 0 there matches the column's own
// DEFAULT, so those callers keep behaving exactly as before this claim
// existed.
function issueSessionToken(user) {
  return jwt.sign(
    {
      userId: user.id ?? user.userId,
      email: user.email,
      strava_id: user.strava_id,
      name: user.name,
      avatar: user.avatar,
      tv: user.token_version ?? 0,
    },
    config.JWT_SECRET,
    { algorithm: ALGORITHM, expiresIn: config.ACCESS_TOKEN_TTL }
  );
}

function verifySessionToken(token) {
  return jwt.verify(token, config.JWT_SECRET, { algorithms: [ALGORITHM] });
}

// Short-lived, single-purpose tokens for carrying a userId through a
// third-party OAuth redirect round-trip without reusing (and thus leaking
// into that provider's logs / browser history) the rider's real session
// token. Moved here from routes/oura.js's inline `jwt.sign({userId, purpose},
// ...)` / server.js's matching `jwt.verify` for /oura/exchange_token, so any
// future purpose-token use (e.g. a similar flow for another integration)
// shares the same helper instead of growing its own copy.
function issuePurposeToken(userId, purpose, expiresIn = '10m') {
  return jwt.sign({ userId, purpose }, config.JWT_SECRET, { algorithm: ALGORITHM, expiresIn });
}

// Verifies the token and checks `purpose` matches, throwing (same as a
// failed jwt.verify) if either fails — callers catch once for both cases,
// same as the original inline try/catch in server.js's /oura/exchange_token.
function verifyPurposeToken(token, purpose) {
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: [ALGORITHM] });
  if (payload.purpose !== purpose) throw new Error(`wrong token purpose (expected "${purpose}")`);
  return payload;
}

module.exports = {
  SESSION_TTL,
  issueSessionToken,
  verifySessionToken,
  issuePurposeToken,
  verifyPurposeToken,
};
