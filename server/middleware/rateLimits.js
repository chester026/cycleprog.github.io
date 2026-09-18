// Shared express-rate-limit instances (T-4.1). Extracted from server.js so
// routes/*.js can apply the exact same limiters the inline routes used,
// instead of each router growing its own copy with drifting numbers.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const config = require('../config');
const logger = require('../lib/logger');

const RATE_LIMIT_MESSAGE = { error: 'Too many requests', code: 'RATE_LIMITED' };

// T-4.3 (docs/audit/00-AUDIT-AND-PLAN.md S-24): express-rate-limit's default
// store is in-process, so with more than one server instance each instance
// enforces its own separate window — a client could get `max` requests per
// instance instead of `max` total. With REDIS_URL set, every limiter below
// shares its window/count via Redis instead so the limit is enforced across
// the whole fleet. `rate-limit-redis` is lazily required here (same pattern
// as lib/cache/redis.js's `ioredis`) so a deploy that never sets REDIS_URL
// never needs it installed.
// One shared ioredis connection for all three limiters below; `prefix` keeps
// each limiter's keys distinct within it (otherwise apiLimiter/authLimiter/
// aiLimiter would all count against the same Redis keys).
let sharedClient;
function redisStore(prefix) {
  if (!config.REDIS_URL) return undefined;
  if (!sharedClient) {
    const Redis = require('ioredis');
    sharedClient = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  const { RedisStore } = require('rate-limit-redis');
  return new RedisStore({
    prefix,
    sendCommand: (...args) => sharedClient.call(...args),
  });
}

logger.info(
  { backend: config.REDIS_URL ? 'redis' : 'memory' },
  `[rateLimits] using ${config.REDIS_URL ? 'redis' : 'memory'} store${config.REDIS_URL ? ' (shared across instances)' : ' (per-instance only)'}`
);

// Everything under /api.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  store: redisStore('rl:api:'),
});

// Login / register / OAuth start — brute-force protection, per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  store: redisStore('rl:auth:'),
});

// OpenAI-backed routes — per user when authenticated, per IP otherwise.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) => (req.user?.userId ? String(req.user.userId) : ipKeyGenerator(req.ip)),
  store: redisStore('rl:ai:'),
});

module.exports = { RATE_LIMIT_MESSAGE, apiLimiter, authLimiter, aiLimiter };
