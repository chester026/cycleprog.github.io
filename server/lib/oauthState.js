// Server-side state for the Strava OAuth "login" and "link" flows, plus the
// short-lived auth code exchanged for a session JWT after /exchange_token
// and /link_strava redirect back to the client.
//
// Why this exists (see docs/audit/layers/01-server.md S-07,
// docs/audit/layers/04-cross-layer.md §5.8): the old flow put the long-lived
// session JWT directly in a redirect URL (?jwt=/?token=), which leaks into
// browser history, Referer headers and CDN/proxy logs, and used the JWT
// itself as the Strava `state` param for /link_strava, which put it in
// Strava's own OAuth logs too. It also never generated or checked a `state`
// for the login flow at all, which is a login-CSRF: an attacker can get a
// victim to complete an OAuth code exchange for the ATTACKER's Strava
// account (crafted authorize link with no state), logging the victim into
// the attacker's account and then have them upload activities/goals to it.
//
// Design: `state` is an opaque random token stored server-side (this file's
// oauth_states table), single-use, 10-minute TTL. It carries `purpose`
// ('login' | 'link'), which `client` ('web' | 'mobile') initiated it, and —
// for 'link' — the userId to link Strava onto. After Strava redirects back
// with `code` + our `state`, /exchange_token or /link_strava consumes the
// state, does the Strava token exchange, and — instead of putting the
// session JWT in the redirect URL — mints a short-lived (60s) single-use
// `auth_codes` row and redirects with THAT in the URL. The client then
// POSTs the auth code to /api/auth/exchange (over HTTPS, in a request body,
// not a URL) to get the real JWT back.
const crypto = require('crypto');

const STATE_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_TTL_MS = 60 * 1000;

const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
// Single canonical scope for every place that sends someone to Strava's
// authorize screen (login and link, web and mobile). Previously 5 different
// call sites on web + 2 on mobile each picked their own scope (some without
// profile:read_all), so a rider who connected Strava from one screen could
// be missing the profile fields (name/avatar) another screen expected. See
// docs/audit/layers/03-react-spa.md W-28.
const STRAVA_SCOPE = 'read,activity:read_all,profile:read_all';

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Pure — no DB, no network. Exported separately so it's trivially unit
// testable and so every call site (server + both clients' /start endpoints)
// builds the exact same URL shape.
function buildStravaAuthorizeUrl({ clientId, redirectUri, state, scope = STRAVA_SCOPE }) {
  if (!clientId) throw new Error('buildStravaAuthorizeUrl: clientId is required');
  if (!redirectUri) throw new Error('buildStravaAuthorizeUrl: redirectUri is required');
  if (!state) throw new Error('buildStravaAuthorizeUrl: state is required');
  const params = new URLSearchParams({
    client_id: String(clientId),
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope,
    state,
  });
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
}

// purpose: 'login' | 'link'; client: 'web' | 'mobile'; userId required (and
// only meaningful) for purpose === 'link'.
async function createState(pool, { purpose, userId = null, client }) {
  if (purpose !== 'login' && purpose !== 'link') {
    throw new Error(`createState: invalid purpose "${purpose}"`);
  }
  if (client !== 'web' && client !== 'mobile') {
    throw new Error(`createState: invalid client "${client}"`);
  }
  const state = randomToken();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  // Opportunistic cleanup of anything expired, piggy-backed on every insert
  // rather than a separate cron — this table is small and short-lived by
  // design, so a stray sweep on writes is enough to keep it bounded.
  await pool.query('DELETE FROM oauth_states WHERE expires_at < NOW()');
  await pool.query(
    'INSERT INTO oauth_states (state, purpose, user_id, client, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [state, purpose, userId, client, expiresAt]
  );
  return state;
}

// Single-use: DELETE ... RETURNING so a replayed/guessed state can never be
// consumed twice, even under concurrent requests (the DELETE only ever
// matches the still-present row once). Returns the row (with `purpose`,
// `user_id`, `client`) or null if the state is missing/expired/already used.
async function consumeState(pool, state) {
  if (!state) return null;
  const { rows } = await pool.query(
    'DELETE FROM oauth_states WHERE state = $1 AND expires_at >= NOW() RETURNING purpose, user_id, client',
    [state]
  );
  return rows[0] || null;
}

async function createAuthCode(pool, userId) {
  const code = randomToken();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  await pool.query('DELETE FROM auth_codes WHERE expires_at < NOW()');
  await pool.query(
    'INSERT INTO auth_codes (code, user_id, expires_at) VALUES ($1, $2, $3)',
    [code, userId, expiresAt]
  );
  return code;
}

// Single-use, same DELETE ... RETURNING pattern as consumeState. Returns the
// userId or null.
async function consumeAuthCode(pool, code) {
  if (!code) return null;
  const { rows } = await pool.query(
    'DELETE FROM auth_codes WHERE code = $1 AND expires_at >= NOW() RETURNING user_id',
    [code]
  );
  return rows[0] ? rows[0].user_id : null;
}

module.exports = {
  STRAVA_SCOPE,
  buildStravaAuthorizeUrl,
  createState,
  consumeState,
  createAuthCode,
  consumeAuthCode,
};
