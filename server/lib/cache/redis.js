// Redis cache backend (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24) — used in
// place of lib/cache/memory.js when `config.REDIS_URL` is set, so more than
// one server instance shares the same cached view (activities, weather,
// Strava rate-limit counters) instead of each instance keeping its own,
// silently-inconsistent copy.
//
// `ioredis` is only required lazily, inside `createRedisCache()`, and that
// factory is only ever called by lib/cache.js when REDIS_URL is actually
// set — so a deploy that never sets REDIS_URL never needs the package
// installed (see package.json comment / T-4.3 task notes: `npm install`
// cannot run in this worktree, so the dependency is declared but not
// vendored here).
function createRedisCache({ namespace, ttlMs, redisUrl }) {
  const Redis = require('ioredis');
  const client = new Redis(redisUrl, {
    // Fail fast on an unreachable Redis instead of buffering commands
    // indefinitely — a cache miss is recoverable, a hung request is not.
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  const key = (k) => `${namespace}:${k}`;

  return {
    async get(k) {
      const raw = await client.get(key(k));
      if (raw === null || raw === undefined) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    },
    async set(k, value, entryTtlMs) {
      const px = entryTtlMs ?? ttlMs;
      const serialized = JSON.stringify(value);
      if (px) {
        await client.set(key(k), serialized, 'PX', px);
      } else {
        await client.set(key(k), serialized);
      }
    },
    async delete(k) {
      await client.del(key(k));
    },
    async clear() {
      // SCAN instead of KEYS — safe on a shared Redis instance with other
      // namespaces/keys in it (KEYS blocks the whole server while scanning).
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${namespace}:*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await client.del(...keys);
      } while (cursor !== '0');
    },
    async keys() {
      const out = [];
      let cursor = '0';
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${namespace}:*`, 'COUNT', 100);
        cursor = next;
        out.push(...keys.map((k) => k.slice(namespace.length + 1)));
      } while (cursor !== '0');
      return out;
    },
    // Not part of the createCache() contract — exposed so callers that need
    // the raw client (e.g. a shared rate-limit store) can get at it without
    // a second connection.
    _client: client,
  };
}

module.exports = { createRedisCache };
