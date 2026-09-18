// Single place that owns the "does this user have a usable Strava access
// token" question — see docs/audit/00-AUDIT-AND-PLAN.md T-1.2 (S-38: the
// refresh block below used to be copy-pasted 11 times across server.js).
//
// getValidAccessToken(userId) refreshes the token when it's expired (or
// about to expire) and persists the new tokens, exactly like every one of
// those 11 copies did. Concurrent callers for the SAME user share one
// in-flight refresh (keyed by userId in `refreshInFlight`) instead of each
// firing their own POST /oauth/token — Strava's refresh endpoint has no
// documented idempotency guarantee across a burst of parallel refreshes for
// the same refresh_token, so collapsing to one is both cheaper and safer.
const { pool } = require('../../db');
const { stravaHttp } = require('../../lib/http');
const config = require('../../config');

class StravaNotLinkedError extends Error {
  constructor(message = 'Strava account not linked') {
    super(message);
    this.name = 'StravaNotLinkedError';
  }
}

// userId -> Promise<accessToken>, cleared once that refresh settles.
const refreshInFlight = new Map();

// Per-request-ish memo of the tiny users row getValidAccessToken reads,
// keyed by userId (S-35 in docs/audit/00-AUDIT-AND-PLAN.md: routes/bikes.js's
// GET /:bikeId/health calls getValidAccessToken — via getActivities() and,
// on a cache miss, the /gear/:id fallback — up to a few times in one
// request; without this every one of those hit Postgres again for the same
// three columns a few hundred ms apart). Bounded + short TTL, not an
// indefinite cache: token data must never go stale for long. 5s comfortably
// covers "a few calls within one HTTP request" while being far shorter than
// the 60s expiry-skew window getValidAccessToken already uses below, so it
// can never mask an actual expiry. refreshAndPersist() below overwrites the
// memoized row with the fresh tokens the moment a refresh completes, so a
// refresh is always visible to the very next read — never invalidated into
// staleness, only ever refreshed forward. Only ever memoizes a row that IS
// linked (see isLinkedRow below) — a disconnect (repositories/users.js
// clearStravaConnection, which writes tokens straight to Postgres, not
// through this module) can therefore still be served a memoized pre-
// disconnect token for up to TOKEN_MEMO_TTL_MS; an accepted, bounded trade-
// off given how short that window is and how narrow the race (disconnect
// racing an in-flight Strava call for the same user) is in practice.
const TOKEN_MEMO_TTL_MS = 5000;
const TOKEN_MEMO_MAX_ENTRIES = 500; // small bound; userId keyspace is tiny but this is belt-and-braces
const tokenMemo = new Map(); // userId -> { row, ts }

function memoGetUserRow(userId) {
  const entry = tokenMemo.get(userId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TOKEN_MEMO_TTL_MS) {
    tokenMemo.delete(userId);
    return undefined;
  }
  return entry.row;
}

function memoSetUserRow(userId, row) {
  tokenMemo.delete(userId); // re-insert at the end for LRU-ish eviction order
  tokenMemo.set(userId, { row, ts: Date.now() });
  while (tokenMemo.size > TOKEN_MEMO_MAX_ENTRIES) {
    tokenMemo.delete(tokenMemo.keys().next().value);
  }
}

// Never memoize a "not linked" row (no refresh token on file). Caching that
// negative buys nothing (StravaNotLinkedError is already a fast, DB-free
// throw once we have the row) and is actively harmful: this module never
// hears about a Strava account being LINKED after the fact (that write goes
// through routes/oauthCallbacks.js -> repositories/users.js, not through
// this file), so a memoized "not linked" row would keep throwing
// StravaNotLinkedError for up to TOKEN_MEMO_TTL_MS after the user actually
// links, purely because of stale memo state.
function isLinkedRow(row) {
  return !!(row && row.strava_access_token && row.strava_refresh_token);
}

// Test-only escape hatch: the memo is module-level state, so tests that
// stub pool.query and assert call counts across multiple getValidAccessToken
// calls need to start from an empty memo instead of whatever a previous
// test/user left behind.
function _clearTokenMemoForTests() {
  tokenMemo.clear();
}

async function refreshAndPersist(userId) {
  if (refreshInFlight.has(userId)) {
    return refreshInFlight.get(userId);
  }
  const p = (async () => {
    const result = await pool.query('SELECT strava_refresh_token FROM users WHERE id = $1', [userId]);
    const row = result.rows[0];
    if (!row || !row.strava_refresh_token) {
      throw new StravaNotLinkedError();
    }
    const response = await stravaHttp.post('https://www.strava.com/oauth/token', {
      client_id: config.STRAVA_CLIENT_ID,
      client_secret: config.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: row.strava_refresh_token,
    });
    const { access_token, refresh_token, expires_at } = response.data;
    await pool.query(
      'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3 WHERE id = $4',
      [access_token, refresh_token, expires_at, userId]
    );
    // Keep the memo in sync with what we just persisted — the very next
    // getValidAccessToken call (e.g. the retry-after-401 path in
    // withStravaToken) must see the new token, not a stale memoized one.
    memoSetUserRow(userId, {
      strava_access_token: access_token,
      strava_refresh_token: refresh_token,
      strava_expires_at: expires_at,
    });
    return access_token;
  })();
  refreshInFlight.set(userId, p);
  try {
    return await p;
  } finally {
    refreshInFlight.delete(userId);
  }
}

// Returns a currently-valid access token for userId, refreshing first if the
// stored one is expired or about to expire within 60s. Throws
// StravaNotLinkedError if the user has never connected Strava (no refresh
// token on file) — callers map that to the same 400/409 the old inline
// checks returned.
async function getValidAccessToken(userId) {
  let user = memoGetUserRow(userId);
  if (!user) {
    const result = await pool.query(
      'SELECT strava_access_token, strava_refresh_token, strava_expires_at FROM users WHERE id = $1',
      [userId]
    );
    user = result.rows[0];
    if (isLinkedRow(user)) memoSetUserRow(userId, user);
  }
  if (!user || !user.strava_access_token || !user.strava_refresh_token) {
    throw new StravaNotLinkedError();
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(user.strava_expires_at) || 0;
  if (now >= expiresAt - 60) {
    return refreshAndPersist(userId);
  }
  return user.strava_access_token;
}

// Runs fn(accessToken), refreshing the token first if needed. If fn's
// request comes back 401 (Strava rejected a token we thought was still
// valid — clock skew, a revoke we haven't seen yet, etc.) it forces exactly
// one refresh and retries fn exactly once with the new token.
async function withStravaToken(userId, fn) {
  const token = await getValidAccessToken(userId);
  try {
    return await fn(token);
  } catch (err) {
    if (err?.response?.status === 401) {
      const freshToken = await refreshAndPersist(userId);
      return fn(freshToken);
    }
    throw err;
  }
}

module.exports = { getValidAccessToken, withStravaToken, StravaNotLinkedError, _clearTokenMemoForTests };
