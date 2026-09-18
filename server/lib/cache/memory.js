// In-process cache backend (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24).
//
// This is the `BoundedCache` class that used to live inline in
// services/strava/activities.js (LRU-ish bound via insertion-order Map +
// TTL), moved here verbatim and wrapped in the async `{get,set,delete,
// clear,keys}` interface lib/cache.js's Redis backend also has to implement.
// Values are stored as-is (no JSON round-trip — same-process, so no need).
class BoundedCache {
  constructor(maxSize, ttl) {
    this._map = new Map(); // preserves insertion order for LRU
    this._maxSize = maxSize;
    this._ttl = ttl;
  }
  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (this._ttl && Date.now() - entry._ts > this._ttl) {
      this._map.delete(key);
      return undefined;
    }
    this._map.delete(key);
    this._map.set(key, entry);
    return entry;
  }
  set(key, value) {
    this._map.delete(key);
    if (!value._ts) value._ts = Date.now();
    this._map.set(key, value);
    while (this._map.size > this._maxSize) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
  }
  delete(key) {
    this._map.delete(key);
  }
  has(key) {
    const entry = this._map.get(key);
    if (!entry) return false;
    if (this._ttl && Date.now() - entry._ts > this._ttl) {
      this._map.delete(key);
      return false;
    }
    return true;
  }
  clear() {
    this._map.clear();
  }
  keys() {
    return Array.from(this._map.keys());
  }
}

// Async cache adapter over BoundedCache — `createCache()`'s default backend.
// `ttlMs` is the cache-wide default; a per-call `ttlMs` on `set()` overrides
// it for that one entry (BoundedCache itself only ever enforces one TTL per
// instance, so a per-entry override is implemented here by stashing the
// entry's own expiry and checking it in `get`/`has`).
function createMemoryCache({ ttlMs, max = 500 } = {}) {
  const store = new BoundedCache(max, ttlMs);

  function wrap(value, entryTtlMs) {
    const expiresAt = entryTtlMs ? Date.now() + entryTtlMs : undefined;
    return { _ts: Date.now(), _expiresAt: expiresAt, value };
  }

  function isExpired(entry) {
    return entry && entry._expiresAt !== undefined && Date.now() > entry._expiresAt;
  }

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key, value, entryTtlMs) {
      store.set(key, wrap(value, entryTtlMs));
    },
    async delete(key) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    },
    async keys() {
      return store.keys();
    },
  };
}

module.exports = { BoundedCache, createMemoryCache };
