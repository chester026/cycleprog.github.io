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
  const result = await pool.query(
    'SELECT strava_access_token, strava_refresh_token, strava_expires_at FROM users WHERE id = $1',
    [userId]
  );
  const user = result.rows[0];
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

module.exports = { getValidAccessToken, withStravaToken, StravaNotLinkedError };
