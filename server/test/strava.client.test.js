process.env.PGHOST = process.env.PGHOST || 'localhost';

const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const { stravaHttp } = require('../lib/http');
stravaHttp.request = vi.fn();
stravaHttp.post = vi.fn();

const { stravaGet, getLimits, StravaRateLimitError } = require('../services/strava/client');

function userRow(overrides = {}) {
  return {
    strava_access_token: 'access-token',
    strava_refresh_token: 'refresh-token',
    strava_expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('services/strava/client', () => {
  beforeEach(() => {
    queryMock.mockReset();
    stravaHttp.request.mockReset();
    stravaHttp.post.mockReset();
    queryMock.mockResolvedValue({ rows: [userRow()] });
  });

  it('updates the rate-limit state from response headers', async () => {
    stravaHttp.request.mockResolvedValueOnce({
      data: [],
      headers: { 'x-ratelimit-limit': '300,3000', 'x-ratelimit-usage': '5,120' },
    });

    await stravaGet(1, '/athlete/activities', { params: { per_page: 1 } });

    expect(await getLimits()).toMatchObject({ limit15min: 300, limitDay: 3000, usage15min: 5, usageDay: 120 });
  });

  it('throws StravaRateLimitError on 429 without retrying', async () => {
    const err = new Error('rate limited');
    err.response = { status: 429, headers: { 'retry-after': '120' } };
    stravaHttp.request.mockRejectedValueOnce(err);

    await expect(stravaGet(1, '/athlete/activities', {})).rejects.toBeInstanceOf(StravaRateLimitError);
    expect(stravaHttp.request).toHaveBeenCalledTimes(1);
  });

  it('carries retryAfterSec from the Retry-After header', async () => {
    const err = new Error('rate limited');
    err.response = { status: 429, headers: { 'retry-after': '42' } };
    stravaHttp.request.mockRejectedValueOnce(err);

    await expect(stravaGet(1, '/athlete/activities', {})).rejects.toMatchObject({ retryAfterSec: 42 });
  });

  it('retries once after a 1s backoff on a 5xx', async () => {
    const err = new Error('server error');
    err.response = { status: 503, headers: {} };
    stravaHttp.request.mockRejectedValueOnce(err).mockResolvedValueOnce({ data: [], headers: {} });

    vi.useFakeTimers();
    const p = stravaGet(1, '/athlete/activities', {});
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    vi.useRealTimers();

    expect(result.data).toEqual([]);
    expect(stravaHttp.request).toHaveBeenCalledTimes(2);
  });

  it('never runs more than 4 requests concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const deferreds = [];
    stravaHttp.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          active++;
          maxActive = Math.max(maxActive, active);
          deferreds.push(() => {
            active--;
            resolve({ data: [], headers: {} });
          });
        })
    );

    const calls = Array.from({ length: 10 }, (_, i) => stravaGet(i, '/athlete', {}));
    // Let the queue fill up to its concurrency cap.
    await new Promise((r) => setImmediate(r));
    expect(maxActive).toBe(4);
    expect(active).toBe(4);

    // Drain the queue.
    while (deferreds.length) {
      deferreds.shift()();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setImmediate(r));
    }
    await Promise.all(calls);
    expect(maxActive).toBe(4);
  });
});
