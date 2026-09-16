process.env.PGHOST = process.env.PGHOST || 'localhost';

// Same require-cache trick as auth.middleware.test.js: stub pool.query
// before any module that does require('../db') reads it, so tokens.js
// (T-1.2/T-1.3) never touches a real database.
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

// Same require-cache trick as pool.query above — stravaHttp is a real axios
// instance (see lib/http.js); mutating its .post here (before
// services/strava/tokens.js requires the same cached module) stubs it
// everywhere without needing vi.mock's ESM-only interception (see
// auth.middleware.test.js's header comment).
const { stravaHttp } = require('../lib/http');
stravaHttp.post = vi.fn();

const { getValidAccessToken, withStravaToken, StravaNotLinkedError } = require('../services/strava/tokens');

function userRow(overrides = {}) {
  return {
    strava_access_token: 'access-old',
    strava_refresh_token: 'refresh-old',
    strava_expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('services/strava/tokens', () => {
  beforeEach(() => {
    queryMock.mockReset();
    stravaHttp.post.mockReset();
  });

  it('throws StravaNotLinkedError when the user has no refresh token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ strava_access_token: null, strava_refresh_token: null }] });
    await expect(getValidAccessToken(1)).rejects.toBeInstanceOf(StravaNotLinkedError);
  });

  it('throws StravaNotLinkedError when the user row does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(getValidAccessToken(1)).rejects.toBeInstanceOf(StravaNotLinkedError);
  });

  it('returns the stored token unchanged when it is not expired', async () => {
    queryMock.mockResolvedValueOnce({ rows: [userRow()] });
    const token = await getValidAccessToken(1);
    expect(token).toBe('access-old');
    expect(stravaHttp.post).not.toHaveBeenCalled();
  });

  it('refreshes and persists new tokens when the stored one is expired', async () => {
    queryMock.mockResolvedValueOnce({ rows: [userRow({ strava_expires_at: Math.floor(Date.now() / 1000) - 10 })] });
    // getValidAccessToken re-selects just the refresh_token inside refreshAndPersist
    queryMock.mockResolvedValueOnce({ rows: [{ strava_refresh_token: 'refresh-old' }] });
    stravaHttp.post.mockResolvedValueOnce({
      data: { access_token: 'access-new', refresh_token: 'refresh-new', expires_at: 999999 },
    });
    queryMock.mockResolvedValueOnce({ rows: [] }); // the UPDATE

    const token = await getValidAccessToken(1);

    expect(token).toBe('access-new');
    expect(stravaHttp.post).toHaveBeenCalledTimes(1);
    const updateCall = queryMock.mock.calls.find((c) => String(c[0]).startsWith('UPDATE users'));
    expect(updateCall[1]).toEqual(['access-new', 'refresh-new', 999999, 1]);
  });

  it('collapses concurrent refreshes for the same user into a single in-flight request', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).startsWith('SELECT strava_access_token')) {
        return { rows: [userRow({ strava_expires_at: Math.floor(Date.now() / 1000) - 10 })] };
      }
      if (String(sql).startsWith('SELECT strava_refresh_token')) {
        return { rows: [{ strava_refresh_token: 'refresh-old' }] };
      }
      return { rows: [] };
    });
    let resolvePost;
    stravaHttp.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );

    const p1 = getValidAccessToken(42);
    const p2 = getValidAccessToken(42);

    // Give both calls a tick to reach the refresh call.
    await new Promise((r) => setImmediate(r));
    expect(stravaHttp.post).toHaveBeenCalledTimes(1);

    resolvePost({ data: { access_token: 'access-new', refresh_token: 'refresh-new', expires_at: 999999 } });
    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('access-new');
    expect(t2).toBe('access-new');
    expect(stravaHttp.post).toHaveBeenCalledTimes(1);
  });

  describe('withStravaToken', () => {
    it('refreshes once and retries exactly once on a 401', async () => {
      queryMock.mockImplementation(async (sql) => {
        if (String(sql).startsWith('SELECT strava_access_token')) {
          return { rows: [userRow()] }; // not expired
        }
        if (String(sql).startsWith('SELECT strava_refresh_token')) {
          return { rows: [{ strava_refresh_token: 'refresh-old' }] };
        }
        return { rows: [] };
      });
      stravaHttp.post.mockResolvedValueOnce({
        data: { access_token: 'access-new', refresh_token: 'refresh-new', expires_at: 999999 },
      });

      let calls = 0;
      const fn = vi.fn(async (token) => {
        calls++;
        if (calls === 1) {
          const err = new Error('unauthorized');
          err.response = { status: 401 };
          throw err;
        }
        return token;
      });

      const result = await withStravaToken(7, fn);
      expect(result).toBe('access-new');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(stravaHttp.post).toHaveBeenCalledTimes(1);
    });

    it('propagates a non-401 error without refreshing', async () => {
      queryMock.mockResolvedValueOnce({ rows: [userRow()] });
      const boom = new Error('boom');
      await expect(withStravaToken(7, async () => { throw boom; })).rejects.toThrow(boom);
      expect(stravaHttp.post).not.toHaveBeenCalled();
    });
  });
});
