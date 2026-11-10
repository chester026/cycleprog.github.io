// Garmin Connect Personal API client (developer.garmin.com/gc-developer-program/personal).
//
// A Personal API key belongs to ONE Garmin account and is for that person's
// own data — Garmin's terms rule out using it in an app that serves other
// people. Here it is the owner's key (GARMIN_API in server/.env): it lets us
// build and verify the Garmin ingest on real data before the multi-user
// integration (Starter tier: per-user OAuth + push webhooks) exists. Its
// callers are scripts/garmin-probe.js, scripts/garmin-sync.js and one
// request handler, services/garminConnect/refresh.js, which only ever serves
// the rider whose connection was made with this key. No other rider's
// feature may depend on this module.
//
// Flow: POST the key (Authorization: ApiKey …) → a 24 h bearer JWT, no
// refresh token → GET the same `/<service>-service/...` paths the Garmin
// Connect web client uses. Read-only by construction: this client has no
// write method.
const BASE_URL = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';

// JSON preferred, anything accepted — see getToken.
const ACCEPT_ANY = 'application/json, text/plain, */*';

// Re-exchange the key this long before the token's own expiry, so a long
// backfill never dies mid-run on a token that expired between two calls.
const TOKEN_REFRESH_MARGIN_MS = 60 * 60 * 1000;
// Used only when the token is not a JWT with an `exp` claim.
const TOKEN_FALLBACK_TTL_MS = 23 * 60 * 60 * 1000;

// Carries the HTTP status and the path, never the key, the token or the
// response body — an axios error holds the Authorization header in
// `config.headers`, so it must not reach a logger as-is.
class GarminPersonalApiError extends Error {
  constructor(message, { status = null, path = null } = {}) {
    super(message);
    this.name = 'GarminPersonalApiError';
    this.status = status;
    this.path = path;
  }
}

function jwtExpiryMs(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Garmin does not document the token response; accept the plausible shapes.
function extractToken(data) {
  if (typeof data === 'string') return data.trim() || null;
  if (data && typeof data === 'object') return data.access_token || data.accessToken || data.token || null;
  return null;
}

/**
 * @param {{apiKey: string, http: {get: Function, post: Function}, now?: () => number}} deps
 *   `http` is an axios-like instance (lib/http.js externalHttp).
 */
function createGarminPersonalClient({ apiKey, http, now = Date.now }) {
  if (!apiKey) throw new GarminPersonalApiError('Garmin Personal API key is not configured (GARMIN_API)');
  let cached = null; // { token, expiresAt }

  function wrap(err, path) {
    const status = err?.response?.status ?? null;
    return new GarminPersonalApiError(
      status ? `Garmin Personal API ${status} for ${path}` : `Garmin Personal API request failed for ${path}: ${err?.code || err?.message || 'unknown error'}`,
      { status, path }
    );
  }

  async function getToken({ force = false } = {}) {
    if (!force && cached && cached.expiresAt - now() > TOKEN_REFRESH_MARGIN_MS) return cached.token;
    let res;
    try {
      res = await http.post(`${BASE_URL}${TOKEN_PATH}`, null, {
        // No narrow Accept: the token comes back as plain text, and asking
        // for application/json only is answered with 406.
        headers: { Authorization: `ApiKey ${apiKey}`, Accept: ACCEPT_ANY },
      });
    } catch (err) {
      throw wrap(err, TOKEN_PATH);
    }
    const token = extractToken(res.data);
    if (!token) throw new GarminPersonalApiError('Garmin Personal API token response had no token', { path: TOKEN_PATH });
    cached = { token, expiresAt: jwtExpiryMs(token) ?? now() + TOKEN_FALLBACK_TTL_MS };
    return token;
  }

  async function request(path, { params, responseType } = {}) {
    const token = await getToken();
    try {
      const res = await http.get(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT_ANY },
        params,
        responseType,
        timeout: 30000,
      });
      return res.data;
    } catch (err) {
      throw wrap(err, path);
    }
  }

  return {
    getToken,
    /** When the cached token expires (ms since epoch), or null before the first exchange. */
    tokenExpiresAt: () => cached?.expiresAt ?? null,
    /** GET a JSON resource; `path` starts with `/…-service/`. Empty responses come back as '' or null. */
    get: (path, params) => request(path, { params }),
    /** The activity's original file(s) as a ZIP archive (usually one .fit). */
    downloadActivityZip: async (activityId) =>
      Buffer.from(await request(`/download-service/files/activity/${encodeURIComponent(activityId)}`, { responseType: 'arraybuffer' })),
  };
}

module.exports = { createGarminPersonalClient, GarminPersonalApiError, BASE_URL, TOKEN_PATH };
