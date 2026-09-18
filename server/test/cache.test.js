// Unit tests for lib/cache.js's default (memory) backend — T-4.3,
// docs/audit/00-AUDIT-AND-PLAN.md S-24. See test/cache.redis.test.js for the
// contract test that runs the same shape of assertions against the Redis
// backend, gated on REDIS_URL being set.
const { createCache } = require('../lib/cache');

describe('lib/cache (memory backend)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined on a miss', async () => {
    const cache = createCache({ namespace: 'test:miss' });
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('round-trips a value written with set()', async () => {
    const cache = createCache({ namespace: 'test:roundtrip' });
    await cache.set('k', { data: [1, 2, 3] });
    expect(await cache.get('k')).toEqual({ data: [1, 2, 3] });
  });

  it('expires an entry after the cache-wide ttlMs elapses', async () => {
    vi.useFakeTimers();
    const cache = createCache({ namespace: 'test:ttl', ttlMs: 1000 });
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');

    vi.advanceTimersByTime(1001);
    expect(await cache.get('k')).toBeUndefined();
  });

  it('expires an entry after its own per-call ttlMs, overriding the cache default', async () => {
    vi.useFakeTimers();
    const cache = createCache({ namespace: 'test:ttl-override', ttlMs: 100000 });
    await cache.set('short', 'v', 500);
    await cache.set('long', 'v'); // falls back to the cache-wide 100000ms

    vi.advanceTimersByTime(600);
    expect(await cache.get('short')).toBeUndefined();
    expect(await cache.get('long')).toBe('v');
  });

  it('evicts the oldest entry once max size is exceeded (bounded/LRU-ish)', async () => {
    const cache = createCache({ namespace: 'test:bound', max: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3); // pushes out 'a', the oldest untouched entry

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
  });

  it('touching an entry with get() protects it from the next eviction', async () => {
    const cache = createCache({ namespace: 'test:lru-touch', max: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.get('a'); // re-promotes 'a' — 'b' is now the oldest
    await cache.set('c', 3);

    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('c')).toBe(3);
  });

  it('keeps two namespaces fully isolated even with the same keys', async () => {
    const cacheA = createCache({ namespace: 'test:ns-a' });
    const cacheB = createCache({ namespace: 'test:ns-b' });
    await cacheA.set('shared-key', 'from-a');
    await cacheB.set('shared-key', 'from-b');

    expect(await cacheA.get('shared-key')).toBe('from-a');
    expect(await cacheB.get('shared-key')).toBe('from-b');
  });

  it('delete() removes a single key without touching the rest', async () => {
    const cache = createCache({ namespace: 'test:delete' });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.delete('a');

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(2);
  });

  it('clear() empties the whole cache', async () => {
    const cache = createCache({ namespace: 'test:clear' });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.keys()).toEqual([]);
  });
});
