// Single Strava-API HTTP client — see docs/audit/00-AUDIT-AND-PLAN.md T-1.2
// (S-25: rate-limiter existed but nothing used it). Everything that talks to
// Strava's REST API (not the OAuth token endpoints, which live in
// tokens.js/oauth.js) goes through stravaGet() here so there is exactly one
// place that: attaches the token (via tokens.js, including its 401-retry),
// reads the rate-limit headers Strava sends back, and bounds how many
// requests are in flight at once.
const { stravaHttp } = require('../../lib/http');
const logger = require('../../lib/logger');
const { withStravaToken } = require('./tokens');

class StravaRateLimitError extends Error {
  constructor(message = 'Strava API rate limit exceeded', retryAfterSec) {
    super(message);
    this.name = 'StravaRateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

// --- Rate-limit state (moved out of server.js verbatim) ---------------------
let stravaRateLimits = {
  limit15min: 300, // Read limit (GET requests) — 300 per 15 min
  limitDay: 3000, // Read limit — 3,000 per day
  usage15min: 0,
  usageDay: 0,
  lastUpdate: null,
};

function updateLimitsFromHeaders(headers) {
  if (!headers) return;
  const limit = headers['x-ratelimit-limit'];
  const usage = headers['x-ratelimit-usage'];
  if (limit && usage) {
    const [limit15, limitDay] = String(limit).split(',').map(Number);
    const [usage15, usageDay] = String(usage).split(',').map(Number);
    stravaRateLimits = {
      limit15min: limit15 || 300,
      limitDay: limitDay || 3000,
      usage15min: usage15,
      usageDay: usageDay,
      lastUpdate: new Date().toISOString(),
    };
  }
}

function checkStravaLimits() {
  const { usage15min, limit15min, usageDay, limitDay } = stravaRateLimits;
  if (usage15min >= limit15min * 0.9) return { blocked: true, reason: '15-min rate limit approaching' };
  if (usageDay >= limitDay * 0.9) return { blocked: true, reason: 'Daily rate limit approaching' };
  return { blocked: false };
}

// Used by GET /api/strava/limits (unchanged route behaviour).
function getLimits() {
  return stravaRateLimits;
}

// --- Small FIFO concurrency queue (no new deps) -----------------------------
const MAX_CONCURRENT = 4;
let active = 0;
const queue = [];

function runNext() {
  if (active >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  active++;
  job
    .fn()
    .then(
      (v) => {
        active--;
        job.resolve(v);
        runNext();
      },
      (e) => {
        active--;
        job.reject(e);
        runNext();
      }
    );
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    runNext();
  });
}

async function requestOnce(userId, method, path, opts) {
  return withStravaToken(userId, async (accessToken) => {
    const doRequest = () =>
      stravaHttp.request({
        method,
        url: `https://www.strava.com/api/v3${path}`,
        headers: { Authorization: `Bearer ${accessToken}` },
        ...opts,
      });
    const started = Date.now();
    const describe = (params) => {
      const q = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
      return `${method.toUpperCase()} ${path}${q}`;
    };
    const budget = () => {
      const l = stravaRateLimits;
      return `${l.usage15min}/${l.limit15min} (15m) ${l.usageDay}/${l.limitDay} (day)`;
    };
    try {
      const response = await doRequest();
      updateLimitsFromHeaders(response.headers);
      // The one line we always want to see: every call to Strava and how much
      // of the app-wide quota is used afterwards.
      logger.info(
        { userId, status: response.status, ms: Date.now() - started },
        `strava ${describe(opts.params)} → ${response.status} · quota ${budget()}`
      );
      return response;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        // Do NOT retry a 429 — Strava told us to back off, retrying blindly
        // is exactly the poisoning-the-well behaviour this refactor removes.
        updateLimitsFromHeaders(err.response.headers);
        logger.warn({ userId }, `strava ${describe(opts.params)} → 429 RATE LIMITED · quota ${budget()}`);
        const retryAfterHeader = err.response.headers?.['retry-after'];
        throw new StravaRateLimitError(
          'Strava API rate limit exceeded',
          retryAfterHeader ? Number(retryAfterHeader) : undefined
        );
      }
      if (status >= 500 && status < 600) {
        // Transient server error — one retry after a short backoff.
        await new Promise((r) => setTimeout(r, 1000));
        const response2 = await doRequest();
        updateLimitsFromHeaders(response2.headers);
        return response2;
      }
      throw err;
    }
  });
}

// GET path (e.g. '/athlete/activities') against Strava's v3 API for userId,
// through the shared token + rate-limit + concurrency machinery.
function stravaGet(userId, path, { params, timeout } = {}) {
  return enqueue(() => requestOnce(userId, 'get', path, { params, timeout }));
}

module.exports = {
  stravaGet,
  getLimits,
  checkStravaLimits,
  updateLimitsFromHeaders,
  StravaRateLimitError,
};
