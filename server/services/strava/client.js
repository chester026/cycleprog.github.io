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
const { createCache } = require('../../lib/cache');

class StravaRateLimitError extends Error {
  constructor(message = 'Strava API rate limit exceeded', retryAfterSec) {
    super(message);
    this.name = 'StravaRateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

// --- Rate-limit state (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24) --------
// Strava's quota (300/15min, 3000/day) is PER APPLICATION — shared across
// every rider, and, once more than one server instance exists, across every
// instance too. Keeping these counters in module state (as server.js used
// to, verbatim) means each instance only ever sees the requests IT made,
// so two instances together could blow well past Strava's real limit
// without either one noticing. Moved behind the same cache interface used
// elsewhere (lib/cache.js) — with REDIS_URL set, every instance reads/
// writes the same two keys and gets an accurate combined view; without it,
// this is exactly the old per-process behaviour (see lib/cache/memory.js).
//
// TTL matches Strava's own reporting window: a 15m-window key that's never
// refreshed (server idle) should stop reporting stale usage after 15
// minutes, same idea for the daily key at 24h.
const RATE_LIMIT_15M_TTL = 15 * 60 * 1000;
const RATE_LIMIT_DAY_TTL = 24 * 60 * 60 * 1000;
const rateLimitCache = createCache({ namespace: 'strava:limit', ttlMs: RATE_LIMIT_DAY_TTL, max: 10 });

const DEFAULT_LIMITS = {
  limit15min: 300, // Read limit (GET requests) — 300 per 15 min
  limitDay: 3000, // Read limit — 3,000 per day
  usage15min: 0,
  usageDay: 0,
  lastUpdate: null,
};

async function updateLimitsFromHeaders(headers) {
  if (!headers) return;
  const limit = headers['x-ratelimit-limit'];
  const usage = headers['x-ratelimit-usage'];
  if (limit && usage) {
    const [limit15, limitDay] = String(limit).split(',').map(Number);
    const [usage15, usageDay] = String(usage).split(',').map(Number);
    const lastUpdate = new Date().toISOString();
    await Promise.all([
      rateLimitCache.set('15m', { limit: limit15 || 300, usage: usage15, lastUpdate }, RATE_LIMIT_15M_TTL),
      rateLimitCache.set('day', { limit: limitDay || 3000, usage: usageDay, lastUpdate }, RATE_LIMIT_DAY_TTL),
    ]);
  }
}

async function checkStravaLimits() {
  const limits = await getLimits();
  const { usage15min, limit15min, usageDay, limitDay } = limits;
  if (usage15min >= limit15min * 0.9) return { blocked: true, reason: '15-min rate limit approaching' };
  if (usageDay >= limitDay * 0.9) return { blocked: true, reason: 'Daily rate limit approaching' };
  return { blocked: false };
}

// Used by GET /api/strava/limits (unchanged route behaviour/shape).
async function getLimits() {
  const [win15, winDay] = await Promise.all([rateLimitCache.get('15m'), rateLimitCache.get('day')]);
  return {
    limit15min: win15?.limit ?? DEFAULT_LIMITS.limit15min,
    limitDay: winDay?.limit ?? DEFAULT_LIMITS.limitDay,
    usage15min: win15?.usage ?? DEFAULT_LIMITS.usage15min,
    usageDay: winDay?.usage ?? DEFAULT_LIMITS.usageDay,
    lastUpdate: winDay?.lastUpdate ?? win15?.lastUpdate ?? DEFAULT_LIMITS.lastUpdate,
  };
}

// --- Small FIFO concurrency queue (no new deps) -----------------------------
// T-4.3: deliberately left as in-process module state, NOT moved behind
// lib/cache.js. This bounds how many requests THIS instance has in flight to
// Strava at once — it has nothing to do with the app-wide quota (that's
// rateLimitCache above, which IS shared). With N instances each still caps
// itself at MAX_CONCURRENT concurrent requests; the shared rate-limit view
// is what stops the fleet as a whole from exceeding Strava's real quota.
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
    const budget = async () => {
      const l = await getLimits();
      return `${l.usage15min}/${l.limit15min} (15m) ${l.usageDay}/${l.limitDay} (day)`;
    };
    try {
      const response = await doRequest();
      await updateLimitsFromHeaders(response.headers);
      // The one line we always want to see: every call to Strava and how much
      // of the app-wide quota is used afterwards.
      logger.info(
        { userId, status: response.status, ms: Date.now() - started },
        `strava ${describe(opts.params)} → ${response.status} · quota ${await budget()}`
      );
      return response;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        // Do NOT retry a 429 — Strava told us to back off, retrying blindly
        // is exactly the poisoning-the-well behaviour this refactor removes.
        await updateLimitsFromHeaders(err.response.headers);
        logger.warn({ userId }, `strava ${describe(opts.params)} → 429 RATE LIMITED · quota ${await budget()}`);
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
        await updateLimitsFromHeaders(response2.headers);
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
