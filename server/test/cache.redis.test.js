// Contract test (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24): runs the same
// get/set/delete/clear/ttl assertions as test/cache.test.js's memory backend
// against the real Redis adapter, so a change to lib/cache/redis.js's
// key-shape or serialization is caught the same way. Only runs when
// REDIS_URL is set (e.g. `REDIS_URL=redis://localhost:6379 npm test`) —
// skipped otherwise, same as the rest of the unit suite staying DB/
// network-free by default.
const hasRedis = !!process.env.REDIS_URL;

describe.skipIf(!hasRedis)('lib/cache (redis backend, contract)', () => {
  let createCache;
  let cache;

  beforeAll(() => {
    createCache = require('../lib/cache').createCache;
  });

  beforeEach(() => {
    cache = createCache({ namespace: `test:redis:${Date.now()}:${Math.random()}` });
  });

  afterEach(async () => {
    await cache.clear();
    if (cache._client) await cache._client.quit();
  });

  it('returns undefined on a miss', async () => {
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('round-trips a JSON-serializable value', async () => {
    await cache.set('k', { data: [1, 2, 3], n: 42 });
    expect(await cache.get('k')).toEqual({ data: [1, 2, 3], n: 42 });
  });

  it('expires an entry after its ttlMs', async () => {
    await cache.set('k', 'v', 50);
    expect(await cache.get('k')).toBe('v');
    await new Promise((r) => setTimeout(r, 150));
    expect(await cache.get('k')).toBeUndefined();
  });

  it('delete() removes a single key without touching the rest', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.delete('a');
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(2);
  });

  it('clear() empties only this namespace', async () => {
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });
});
