// Unit tests for services/hrZones.js. `computeHrHistogram` is pure (no
// mocks needed); the batch distribution path is tested with
// pool.query/recommendations.getUserProfile/stravaActivities.getStreams
// stubbed, following this repo's require-cache-stub convention (see
// test/ftpAnalysis.service.test.js) — the real-Postgres `activity_analysis`
// cache path is covered by test/integration/hrZonesAnalytics.test.js.
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const recommendations = require('../recommendations');
const getUserProfileMock = vi.fn();
recommendations.getUserProfile = getUserProfileMock;

const stravaActivities = require('../services/strava/activities');
const getStreamsMock = vi.fn();
stravaActivities.getStreams = getStreamsMock;

const {
  computeHrHistogram,
  computeHrZonesDistribution,
  MAX_HR_STREAM_FETCHES_PER_REQUEST,
} = require('../services/hrZones');

function activity(overrides = {}) {
  return {
    id: 1,
    average_heartrate: 150,
    moving_time: 3600,
    has_heartrate: true,
    start_date: new Date().toISOString(),
    ...overrides,
  };
}

// maxhr-only profile (no resting_hr/max_hr set) -> zones derived from the
// 220-age/190bpm fallback; a profile is stubbed with a fixed max_hr so zone
// boundaries in assertions are predictable.
function profile() {
  return { max_hr: 200, resting_hr: 50 };
}

describe('services/hrZones', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getUserProfileMock.mockReset();
    getStreamsMock.mockReset();
    getUserProfileMock.mockResolvedValue(profile());
  });

  describe('computeHrHistogram (pure)', () => {
    it('attributes the seconds between consecutive samples to the earlier sample\'s bpm', () => {
      const streams = {
        heartrate: { data: [140, 140, 160, 160] },
        time: { data: [0, 10, 20, 30] },
      };
      const histogram = computeHrHistogram(streams);
      expect(histogram.source).toBe('streams');
      // 0->10 (10s @140), 10->20 (10s @140), 20->30 (10s @160)
      expect(histogram.bins['140']).toBe(20);
      expect(histogram.bins['160']).toBe(10);
      expect(histogram.total_seconds).toBe(30);
    });

    it('caps a gap between samples at 30s (Strava pause)', () => {
      const streams = {
        heartrate: { data: [140, 140] },
        time: { data: [0, 500] }, // an 8+ minute gap, e.g. a paused ride
      };
      const histogram = computeHrHistogram(streams);
      expect(histogram.bins['140']).toBe(30);
      expect(histogram.total_seconds).toBe(30);
    });

    it('skips invalid/dropout bpm readings and out-of-order timestamps', () => {
      const streams = {
        heartrate: { data: [0, 140, null, 150] },
        time: { data: [0, 10, 5, 25] }, // 5 < 10 -> out of order for that pair
      };
      const histogram = computeHrHistogram(streams);
      // pair (0,10): bpm=0 -> skipped. pair(10,5): dt<0 -> skipped.
      // pair(5,25): dt=20 attributed to bpm at index 2 = null -> skipped.
      expect(histogram.total_seconds).toBe(0);
      expect(histogram.bins).toEqual({});
    });

    it('returns an empty histogram for missing/short streams', () => {
      expect(computeHrHistogram({})).toEqual({ bins: {}, total_seconds: 0, source: 'streams' });
      expect(computeHrHistogram({ heartrate: { data: [140] }, time: { data: [0] } })).toEqual({
        bins: {}, total_seconds: 0, source: 'streams',
      });
    });
  });

  describe('computeHrZonesDistribution', () => {
    it('uses a cached histogram without calling getStreams', async () => {
      const cachedHistogram = { bins: { '140': 100 }, total_seconds: 100, source: 'streams' };
      queryMock.mockResolvedValueOnce({ rows: [{ result: cachedHistogram, computed_at: new Date() }] });

      const result = await computeHrZonesDistribution(1, [activity({ id: 42 })], '4w');
      expect(getStreamsMock).not.toHaveBeenCalled();
      expect(result.coverage.withStreams).toBe(1);
      expect(result.coverage.fallback).toBe(0);
      expect(result.coverage.pending).toBe(0);
      const totalSeconds = result.zones.reduce((sum, z) => sum + z.seconds, 0);
      expect(totalSeconds).toBe(100);
    });

    it('fetches+persists a histogram on a cache miss, within budget', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // cache miss
      getStreamsMock.mockResolvedValue({
        heartrate: { data: [140, 140] },
        time: { data: [0, 60] },
      });
      queryMock.mockResolvedValueOnce({ rows: [] }); // INSERT ... ON CONFLICT persist

      const result = await computeHrZonesDistribution(1, [activity({ id: 42 })], '4w');
      expect(getStreamsMock).toHaveBeenCalledWith(1, 42);
      expect(queryMock.mock.calls[1][0]).toMatch(/INSERT INTO activity_analysis/);
      expect(result.coverage.withStreams).toBe(1);
      expect(result.coverage.fallback).toBe(0);
    });

    it('falls back to average_heartrate/moving_time when a stream fetch throws', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // cache miss
      getStreamsMock.mockRejectedValueOnce(new Error('strava down'));

      const result = await computeHrZonesDistribution(1, [activity({ id: 42, average_heartrate: 150, moving_time: 3600 })], '4w');
      expect(result.coverage.fallback).toBe(1);
      expect(result.coverage.withStreams).toBe(0);
      const totalSeconds = result.zones.reduce((sum, z) => sum + z.seconds, 0);
      expect(totalSeconds).toBe(3600);
    });

    it('queues activities past the per-request budget as pending, using the fallback for them', async () => {
      queryMock.mockResolvedValue({ rows: [] }); // every activity is an uncached miss
      getStreamsMock.mockResolvedValue({ heartrate: { data: [140, 140] }, time: { data: [0, 60] } });

      const activities = Array.from(
        { length: MAX_HR_STREAM_FETCHES_PER_REQUEST + 5 },
        (_, i) => activity({ id: i + 1 })
      );
      const result = await computeHrZonesDistribution(1, activities, '4w');

      expect(getStreamsMock).toHaveBeenCalledTimes(MAX_HR_STREAM_FETCHES_PER_REQUEST);
      expect(result.coverage.withStreams).toBe(MAX_HR_STREAM_FETCHES_PER_REQUEST);
      expect(result.coverage.pending).toBe(5);
      expect(result.coverage.fallback).toBe(5);
      expect(result.coverage.total).toBe(MAX_HR_STREAM_FETCHES_PER_REQUEST + 5);
    });

    it('returns zero-percent zones with no activities', async () => {
      const result = await computeHrZonesDistribution(1, [], '4w');
      expect(result.coverage).toEqual({ total: 0, withStreams: 0, fallback: 0, pending: 0 });
      expect(result.zones.every((z) => z.seconds === 0 && z.percent === 0)).toBe(true);
    });
  });
});
