// Cache abstraction (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24) — one
// factory every module that needs a cache goes through, so the server can
// run more than one instance later without every cache silently becoming
// per-instance-inconsistent state.
//
// `createCache({ namespace, ttlMs, max })` returns an ASYNC
// `{get, set, delete, clear, keys}` interface (Redis needs it — a network
// round trip can't be synchronous) backed by:
//   - lib/cache/memory.js  — default. Same BoundedCache (LRU-ish bound +
//     TTL) semantics the old per-module in-memory caches had, just behind
//     the async interface.
//   - lib/cache/redis.js   — used instead when `config.REDIS_URL` is set,
//     so every instance of the server reads/writes the same cached values.
//     `ioredis` is lazily required inside that module's factory, which is
//     only called here when REDIS_URL is actually set, so a deploy that
//     never sets it never needs the package installed.
//
// `namespace` prefixes every key (`namespace:key` for Redis; scopes eviction
// per-cache for memory) so two `createCache()` callers never collide even if
// they happen to use the same keys (e.g. both keyed by userId).
const config = require('../config');
const logger = require('./logger');
const { createMemoryCache } = require('./cache/memory');

// Logged once per process, the first time a cache is created — not once per
// namespace — so boot logs stay one line, not one per cache.
let backendLogged = false;
function logBackendOnce(backend) {
  if (backendLogged) return;
  backendLogged = true;
  logger.info({ backend }, `[cache] using ${backend} backend${backend === 'redis' ? ' (shared across instances)' : ' (per-instance only)'}`);
}

function createCache({ namespace, ttlMs, max = 500 } = {}) {
  if (!namespace) throw new Error('createCache requires a namespace');

  if (config.REDIS_URL) {
    logBackendOnce('redis');
    // Lazy require: lib/cache/redis.js itself lazily requires('ioredis'),
    // and this whole branch (and therefore that require) only ever runs
    // when REDIS_URL is set.
    const { createRedisCache } = require('./cache/redis');
    return createRedisCache({ namespace, ttlMs, redisUrl: config.REDIS_URL });
  }

  logBackendOnce('memory');
  return createMemoryCache({ ttlMs, max });
}

module.exports = { createCache };
