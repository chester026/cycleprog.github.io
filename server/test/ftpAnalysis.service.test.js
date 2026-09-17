// Unit tests for services/ftpAnalysis.js (T-3.6, docs/audit/00-AUDIT-AND-
// PLAN.md T-3.6) with pool.query/getUserProfile/stravaActivities.getStreams
// stubbed — no real DB or network (the real-Postgres path, including the
// `activity_analysis` cache table itself, is covered by
// test/integration/ftpAnalysis.test.js per the "SQL changes need real-PG
// integration tests" rule). Following this repo's require-cache-stub
// convention (see test/power.service.test.js / test/skills.service.test.js).
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const recommendations = require('../recommendations');
const getUserProfileMock = vi.fn();
recommendations.getUserProfile = getUserProfileMock;

const stravaActivities = require('../services/strava/activities');
const getStreamsMock = vi.fn();
stravaActivities.getStreams = getStreamsMock;

const { analyzeActivity, analyzeActivities, getHrThresholdForUser } = require('../services/ftpAnalysis');

function activity(overrides = {}) {
  return {
    id: 1,
    average_heartrate: 150,
    start_date: new Date().toISOString(),
    ...overrides,
  };
}

function streamsFixture({ belowSec = 30, aboveSec = 0, belowHr = 120, aboveHr = 175 } = {}) {
  const hr = [...Array(belowSec).fill(belowHr), ...Array(aboveSec).fill(aboveHr), ...Array(belowSec).fill(belowHr)];
  return { heartrate: { data: hr }, time: { data: hr.map((_, i) => i) } };
}

describe('services/ftpAnalysis', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getUserProfileMock.mockReset();
    getStreamsMock.mockReset();
    getUserProfileMock.mockResolvedValue(null);
  });

  describe('getHrThresholdForUser', () => {
    it('defaults to 160bpm when there is no profile', async () => {
      getUserProfileMock.mockResolvedValue(null);
      expect(await getHrThresholdForUser(1)).toBe(160);
    });

    it('uses zone 4\'s floor from the profile\'s HR zones when available', async () => {
      getUserProfileMock.mockResolvedValue({ max_hr: 200, resting_hr: 50 });
      const threshold = await getHrThresholdForUser(1);
      expect(threshold).toBeGreaterThan(160); // Karvonen zone4 floor for a 200/50 profile is well above the flat 160 default
    });

    it('falls back to 160bpm when getUserProfile throws', async () => {
      getUserProfileMock.mockRejectedValue(new Error('db down'));
      expect(await getHrThresholdForUser(1)).toBe(160);
    });
  });

  describe('analyzeActivity', () => {
    it('computes from streams and persists the result on a cache miss', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // cache lookup: miss
      getStreamsMock.mockResolvedValue(streamsFixture({ aboveSec: 150 }));
      queryMock.mockResolvedValueOnce({ rows: [] }); // INSERT ... ON CONFLICT

      const { result, fromCache } = await analyzeActivity(1, 42, 160);
      expect(fromCache).toBe(false);
      expect(result.totalIntervals).toBe(1);
      expect(getStreamsMock).toHaveBeenCalledWith(1, 42);
      // Second query call is the persist (INSERT ... ON CONFLICT).
      expect(queryMock.mock.calls[1][0]).toMatch(/INSERT INTO activity_analysis/);
    });

    it('returns the cached result without touching streams on a cache hit', async () => {
      const cached = { totalMinutes: 5, totalIntervals: 1, intervals: [] };
      queryMock.mockResolvedValueOnce({ rows: [{ result: cached, computed_at: new Date() }] });

      const { result, fromCache } = await analyzeActivity(1, 42);
      expect(fromCache).toBe(true);
      expect(result).toEqual(cached);
      expect(getStreamsMock).not.toHaveBeenCalled();
    });
  });

  describe('analyzeActivities', () => {
    it('skips activities with no average_heartrate before ever fetching streams', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const result = await analyzeActivities(1, [activity({ id: 1, average_heartrate: null })], { hrThreshold: 160 });
      expect(result.activitiesAnalyzed).toBe(0);
      expect(getStreamsMock).not.toHaveBeenCalled();
    });

    it('aggregates totalMinutes/totalIntervals/highIntensitySessions across analyzed activities', async () => {
      queryMock.mockImplementation((sql) => {
        if (sql.includes('SELECT result')) return Promise.resolve({ rows: [] }); // no cache
        return Promise.resolve({ rows: [] }); // persist
      });
      getStreamsMock.mockImplementation((userId, id) =>
        Promise.resolve(id === 1 ? streamsFixture({ aboveSec: 150 }) : streamsFixture({ aboveSec: 0 }))
      );

      const result = await analyzeActivities(1, [activity({ id: 1 }), activity({ id: 2 })], { hrThreshold: 160 });
      expect(result.activitiesAnalyzed).toBe(2);
      expect(result.highIntensitySessions).toBe(1); // only activity 1 has an interval
      expect(result.totalIntervals).toBe(1);
      expect(result.totalMinutes).toBeGreaterThan(0);
    });

    it('stops fetching new streams once MAX_UNCACHED_STREAM_FETCHES is reached, but keeps counting cached ones', async () => {
      const { MAX_UNCACHED_STREAM_FETCHES } = require('../services/ftpAnalysis');
      queryMock.mockResolvedValue({ rows: [] }); // every activity is an uncached miss
      getStreamsMock.mockResolvedValue(streamsFixture({ aboveSec: 0 }));

      const activities = Array.from({ length: MAX_UNCACHED_STREAM_FETCHES + 3 }, (_, i) => activity({ id: i + 1 }));
      const result = await analyzeActivities(1, activities, { hrThreshold: 160 });

      expect(getStreamsMock).toHaveBeenCalledTimes(MAX_UNCACHED_STREAM_FETCHES);
      expect(result.activitiesAnalyzed).toBe(MAX_UNCACHED_STREAM_FETCHES);
      expect(result.activitiesSkipped).toBe(3);
    });

    it('continues past an activity whose stream fetch fails, counting it as skipped', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      getStreamsMock.mockRejectedValueOnce(new Error('strava down')).mockResolvedValueOnce(streamsFixture({ aboveSec: 150 }));

      const result = await analyzeActivities(1, [activity({ id: 1 }), activity({ id: 2 })], { hrThreshold: 160 });
      expect(result.activitiesSkipped).toBe(1);
      expect(result.activitiesAnalyzed).toBe(1);
      expect(result.highIntensitySessions).toBe(1);
    });
  });
});
