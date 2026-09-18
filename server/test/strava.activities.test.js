process.env.PGHOST = process.env.PGHOST || 'localhost';

const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const { stravaHttp } = require('../lib/http');
stravaHttp.request = vi.fn();
stravaHttp.post = vi.fn();

const activities = require('../services/strava/activities');

function userRow() {
  return {
    strava_access_token: 'access-token',
    strava_refresh_token: 'refresh-token',
    strava_expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

function stravaActivity(id, overrides = {}) {
  return {
    id,
    name: `Ride ${id}`,
    type: 'Ride',
    start_date: '2026-01-01T00:00:00Z',
    distance: 10000,
    moving_time: 1000,
    elapsed_time: 1100,
    ...overrides,
  };
}

// Every test uses a fresh userId so the module-level 6h "recent refresh"
// throttle (services/strava/activities.js's lastRecentRefresh map) never
// carries state between tests — each user's first getActivities() call
// always also fires one background refreshRecent() incremental fetch
// (with an `after` param), on top of whatever the sync itself needed. Tests
// account for that extra call instead of assuming an exact total count.
let nextUserId = 1000;
function freshUserId() {
  return nextUserId++;
}

describe('services/strava/activities', () => {
  beforeEach(() => {
    queryMock.mockReset();
    stravaHttp.request.mockReset();
    // Default fallback for any request beyond what a test explicitly queues
    // (e.g. the background recent-refresh call) — empty page, no crash.
    stravaHttp.request.mockResolvedValue({ data: [], headers: {} });
  });

  it('does a full paginated download when synced_activities has no rows for the user, then upserts', async () => {
    const userId = freshUserId();
    const page1 = Array.from({ length: 200 }, (_, i) => stravaActivity(i + 1));
    const page2 = [stravaActivity(201, { type: 'Run' })];
    stravaHttp.request
      .mockResolvedValueOnce({ data: page1, headers: {} })
      .mockResolvedValueOnce({ data: page2, headers: {} });

    const upsertMock = vi.fn().mockResolvedValue({ rows: [] });
    queryMock.mockImplementation(async (sql, params) => {
      if (String(sql).startsWith('SELECT strava_access_token')) return { rows: [userRow()] };
      if (String(sql).includes('raw IS NULL')) return { rows: [] };
      if (String(sql).startsWith('SELECT MAX(start_date)')) return { rows: [{ max_start: null }] };
      if (String(sql).startsWith('INSERT INTO synced_activities')) return upsertMock(sql, params);
      if (String(sql).startsWith('SELECT * FROM synced_activities')) {
        const rows = [...page1, ...page2].map((a) => ({
          strava_id: a.id,
          name: a.name,
          type: a.type,
          start_date: a.start_date,
          raw: a,
        }));
        return { rows };
      }
      return { rows: [] };
    });

    const result = await activities.getActivities(userId);

    // The full download itself (page1 full, page2 short) made exactly two
    // requests with no `after` param.
    const noAfterCalls = stravaHttp.request.mock.calls.filter((c) => c[0].params.after === undefined);
    expect(noAfterCalls).toHaveLength(2);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    // Default types filter (Ride/VirtualRide) drops the one 'Run'.
    expect(result).toHaveLength(200);
    expect(result.every((a) => a.type === 'Ride')).toBe(true);
  });

  it('fetches with only the `after` param when synced_activities already has rows', async () => {
    const userId = freshUserId();
    const maxStart = '2026-01-10T00:00:00.000Z';
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).startsWith('SELECT strava_access_token')) return { rows: [userRow()] };
      if (String(sql).includes('raw IS NULL')) return { rows: [] };
      if (String(sql).startsWith('SELECT MAX(start_date)')) return { rows: [{ max_start: maxStart }] };
      if (String(sql).startsWith('INSERT INTO synced_activities')) return { rows: [] };
      if (String(sql).startsWith('SELECT * FROM synced_activities')) return { rows: [] };
      return { rows: [] };
    });

    await activities.getActivities(userId);

    // Every request Strava saw for this cache-miss (the incremental sync
    // itself, plus the background recent-refresh) carried an `after` param
    // — never a full unfiltered pagination loop.
    expect(stravaHttp.request.mock.calls.length).toBeGreaterThan(0);
    for (const call of stravaHttp.request.mock.calls) {
      expect(call[0].params.after).toBeTypeOf('number');
    }
  });

  it('falls back to whatever is in Postgres when rate-limited during sync', async () => {
    const userId = freshUserId();
    const storedRow = {
      strava_id: 555,
      name: 'Stored ride',
      type: 'Ride',
      start_date: '2026-01-05T00:00:00Z',
      raw: stravaActivity(555),
    };
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).startsWith('SELECT strava_access_token')) return { rows: [userRow()] };
      if (String(sql).includes('raw IS NULL')) return { rows: [] };
      if (String(sql).startsWith('SELECT MAX(start_date)')) return { rows: [{ max_start: '2026-01-05T00:00:00Z' }] };
      if (String(sql).startsWith('SELECT * FROM synced_activities')) return { rows: [storedRow] };
      return { rows: [] };
    });
    const rateLimitErr = new Error('rate limited');
    rateLimitErr.response = { status: 429, headers: {} };
    stravaHttp.request.mockReset();
    stravaHttp.request.mockRejectedValue(rateLimitErr);

    const result = await activities.getActivities(userId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(555);
  });

  it('no longer writes a truncated/unfiltered response straight into activitiesCache (S-23)', async () => {
    // getActivities is the only writer of activitiesCache, and it always
    // writes the full, type-filtered set it just read from Postgres — never
    // a truncated, unfiltered per_page:100 Strava response the way the old
    // calculateVO2maxForPeriod did.
    const userId = freshUserId();
    const setSpy = vi.spyOn(activities.activitiesCache, 'set');
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).startsWith('SELECT strava_access_token')) return { rows: [userRow()] };
      if (String(sql).includes('raw IS NULL')) return { rows: [] };
      if (String(sql).startsWith('SELECT MAX(start_date)')) return { rows: [{ max_start: '2026-01-05T00:00:00Z' }] };
      if (String(sql).startsWith('SELECT * FROM synced_activities')) return { rows: [] };
      return { rows: [] };
    });

    await activities.getActivities(userId);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0]).toBe(userId);
    setSpy.mockRestore();
  });

  it('serves the in-memory cache on a hit without touching Postgres or Strava', async () => {
    const userId = freshUserId();
    await activities.activitiesCache.set(userId, { data: [stravaActivity(1)], _ts: Date.now() });

    const result = await activities.getActivities(userId);

    expect(result).toEqual([stravaActivity(1)]);
    expect(queryMock).not.toHaveBeenCalled();
    expect(stravaHttp.request).not.toHaveBeenCalled();
  });
});
