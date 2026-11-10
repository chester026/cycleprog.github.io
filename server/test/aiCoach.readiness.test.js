// Unit tests for the readiness tools (analyze_readiness/get_oura_readiness)
// and the fetchRecentOuraDays helper they now share (T-? coach-readiness —
// Problem A of the coach-readiness-budget task: analyze_readiness became THE
// readiness tool, fetching Oura itself so the model no longer has to
// remember to call two tools). repositories/oura.js and ouraService.js are
// stubbed — no real DB/Oura-API connection, same convention as
// test/aiCoach.memory.test.js.
const ouraRepo = require('../repositories/oura');
const getOuraConnectionStatusMock = vi.fn();
ouraRepo.getOuraConnectionStatus = getOuraConnectionStatusMock;

const ouraService = require('../ouraService');
const fetchAndCacheOuraDataMock = vi.fn();
ouraService.fetchAndCacheOuraData = fetchAndCacheOuraDataMock;

// Garmin is stubbed to "not connected" unless a test says otherwise.
const { getCoachHealthMock, resetGarminCoachHealth } = require('./stubGarminCoachHealth');
const { supplement } = require('../services/garminConnect/coachHealth');
const createCoachModule = require('../aiCoach');

// A fresh (not stale) cached row — 'today' in UTC — so tests that don't care
// about the lazy-refresh path never trigger it.
function freshRow(overrides = {}) {
  return {
    day: new Date().toISOString().slice(0, 10),
    readiness_score: 78,
    sleep_score: 82,
    activity_score: 65,
    total_sleep_hours: 7.44,
    average_hrv: 52.34,
    resting_heart_rate: 54.12,
    min_heart_rate: 50.2,
    stress_high_seconds: 1800,
    stress_recovery_high_seconds: 3600,
    stress_day_summary: 'normal',
    resilience_level: 'solid',
    spo2_average: 97.6,
    ...overrides,
  };
}

describe('aiCoach readiness tools', () => {
  let executeTool, pool;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGarminCoachHealth();
    pool = { query: vi.fn() };
    const coach = createCoachModule({
      pool,
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
    executeTool = coach.executeTool;
  });

  describe('analyze_readiness', () => {
    it('signals Apple Health without touching the Oura repo or pool at all', async () => {
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: { recovery_score: 80 } });
      expect(result).toEqual({ connected: true, source: 'apple_health' });
      expect(getOuraConnectionStatusMock).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('reports not connected when neither Apple Health nor Oura is available', async () => {
      getOuraConnectionStatusMock.mockResolvedValue(null);
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result).toEqual({ connected: false, source: 'none' });
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('treats a stale/cleared Oura connection (no access token) as not connected', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: null });
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result).toEqual({ connected: false, source: 'none' });
    });

    it('fetches and returns the rider\'s Oura days (DB data, safe in a tool result) when Oura is connected', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      pool.query.mockResolvedValue({ rows: [freshRow()] });

      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });

      expect(result.connected).toBe(true);
      expect(result.source).toBe('oura');
      expect(result.oura.days).toHaveLength(1);
      expect(result.oura.days[0]).toMatchObject({ readiness_score: 78, total_sleep_hours: 7.4, average_hrv_ms: 52.3 });
      // Apple Health branch never runs, so this is the ONE call this turn.
      expect(fetchAndCacheOuraDataMock).not.toHaveBeenCalled();
    });

    it('reports connected:false (still source:oura) when Oura is connected but has no cached days yet', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      pool.query.mockResolvedValue({ rows: [] });
      fetchAndCacheOuraDataMock.mockResolvedValue({ synced: 0 });

      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });

      expect(result).toEqual({
        connected: false,
        source: 'oura',
        oura: { days: [], note: expect.stringContaining('No Oura data available yet') },
      });
    });

    it('healthContext wins over an Oura connection when both are present in the same turn', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: { recovery_score: 91 } });
      expect(result).toEqual({ connected: true, source: 'apple_health' });
      expect(getOuraConnectionStatusMock).not.toHaveBeenCalled();
    });
  });

  // Owner decision 10.11.2026: Garmin supplements Apple Health / Oura with
  // Body Battery and stress, and is the source only when it is the only one.
  describe('analyze_readiness with Garmin connected', () => {
    const garminDay = (overrides = {}) => ({
      day: new Date().toISOString().slice(0, 10),
      body_battery_high: 88,
      body_battery_low: 19,
      body_battery_charged: 71,
      body_battery_drained: 64,
      stress_avg: 28,
      stress_qualifier: 'BALANCED',
      stress_high_minutes: 30,
      stress_rest_minutes: 510,
      sleep_hours: 7.2,
      sleep_score: 81,
      hrv_ms: 48,
      hrv_status: 'BALANCED',
      resting_hr_bpm: 47,
      ...overrides,
    });
    const garminHealth = (overrides = {}) => ({ days: [garminDay()], as_of: '2026-11-10T06:00:00.000Z', stale: false, can_refresh: true, ...overrides });

    it('next to Oura: Oura stays the source, Garmin adds Body Battery and stress only', async () => {
      const health = garminHealth();
      getCoachHealthMock.mockResolvedValue(health);
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      pool.query.mockResolvedValue({ rows: [freshRow()] });

      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result.source).toBe('oura');
      expect(result.oura.days).toHaveLength(1);
      expect(result.garmin).toEqual(supplement(health));
      expect(result.garmin.days[0]).toEqual({
        day: garminDay().day,
        body_battery_high: 88,
        body_battery_low: 19,
        body_battery_charged: 71,
        body_battery_drained: 64,
        stress_avg: 28,
        stress_qualifier: 'BALANCED',
        stress_high_minutes: 30,
        stress_rest_minutes: 510,
      });
      // Two sets of sleep numbers for one night would leave the model to pick.
      expect(result.garmin.days[0]).not.toHaveProperty('sleep_hours');
      expect(result.garmin.days[0]).not.toHaveProperty('hrv_ms');
      expect(result.garmin).toMatchObject({ stale: false, can_refresh: true, as_of: '2026-11-10T06:00:00.000Z' });
    });

    it('next to Apple Health: the same supplement, and still none of Apple Health\'s numbers in the result', async () => {
      getCoachHealthMock.mockResolvedValue(garminHealth({ stale: true }));
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: { recovery_score: 80, sleep_hours: 6.1 } });
      expect(result).toMatchObject({ connected: true, source: 'apple_health', garmin: { stale: true } });
      expect(result.garmin.days[0]).not.toHaveProperty('sleep_hours');
      expect(JSON.stringify(result)).not.toContain('6.1');
      expect(getOuraConnectionStatusMock).not.toHaveBeenCalled();
    });

    it('alone: Garmin is the source and carries its own sleep, HRV and resting HR', async () => {
      const health = garminHealth();
      getCoachHealthMock.mockResolvedValue(health);
      getOuraConnectionStatusMock.mockResolvedValue(null);
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result).toEqual({ connected: true, source: 'garmin', garmin: health });
      expect(result.garmin.days[0]).toMatchObject({ sleep_hours: 7.2, hrv_ms: 48, resting_hr_bpm: 47, body_battery_high: 88 });
    });

    it('alone with nothing synced yet: not connected in effect, but the refresh is still on offer', async () => {
      getCoachHealthMock.mockResolvedValue(garminHealth({ days: [], as_of: null, stale: true }));
      getOuraConnectionStatusMock.mockResolvedValue(null);
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result).toMatchObject({ connected: false, source: 'garmin', garmin: { days: [], stale: true, can_refresh: true } });
    });

    it('a Garmin day without Body Battery or stress is not passed along as a supplement', async () => {
      getCoachHealthMock.mockResolvedValue(garminHealth({ days: [garminDay({ body_battery_high: null, body_battery_low: null, stress_avg: null })] }));
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      pool.query.mockResolvedValue({ rows: [freshRow()] });
      const result = await executeTool('analyze_readiness', {}, { userId, healthContext: undefined });
      expect(result.garmin.days).toEqual([]);
    });
  });

  describe('get_oura_readiness (via the shared fetchRecentOuraDays helper)', () => {
    it('maps and rounds cached rows, newest first', async () => {
      pool.query.mockResolvedValue({ rows: [freshRow()] });
      const result = await executeTool('get_oura_readiness', { days: 5 }, { userId });
      expect(result.days[0]).toEqual({
        day: freshRow().day,
        readiness_score: 78,
        sleep_score: 82,
        activity_score: 65,
        total_sleep_hours: 7.4,
        average_hrv_ms: 52.3,
        resting_heart_rate_bpm: 54.1,
        min_heart_rate_bpm: 50.2,
        stress_high_minutes: 30,
        stress_recovery_minutes: 60,
        stress_day_summary: 'normal',
        resilience_level: 'solid',
        spo2_average_percent: 97.6,
      });
      // days is bounded to [1,30] and passed through as the query LIMIT.
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [userId, 5]);
    });

    it('lazily refreshes from the Oura API when the cache is stale, then re-reads it', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [freshRow({ day: '2020-01-01' })] }) // stale
        .mockResolvedValueOnce({ rows: [freshRow()] }); // re-read after refresh
      fetchAndCacheOuraDataMock.mockResolvedValue({ synced: 3 });

      const result = await executeTool('get_oura_readiness', {}, { userId });

      expect(fetchAndCacheOuraDataMock).toHaveBeenCalledTimes(1);
      expect(fetchAndCacheOuraDataMock).toHaveBeenCalledWith(pool, userId, expect.objectContaining({ startDate: expect.any(String), endDate: expect.any(String) }));
      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.days[0].readiness_score).toBe(78);
    });

    it('serves the stale cache as-is when the lazy refresh itself fails', async () => {
      pool.query.mockResolvedValue({ rows: [freshRow({ day: '2020-01-01' })] });
      fetchAndCacheOuraDataMock.mockRejectedValue(new Error('Oura API down'));

      const result = await executeTool('get_oura_readiness', {}, { userId });

      expect(result.days).toHaveLength(1);
    });

    it('returns the empty-state note when there is no cached data and nothing to refresh', async () => {
      pool.query.mockResolvedValue({ rows: [] });
      fetchAndCacheOuraDataMock.mockResolvedValue({ synced: 0 });
      const result = await executeTool('get_oura_readiness', {}, { userId });
      expect(result).toEqual({ days: [], note: expect.stringContaining('No Oura data available yet') });
    });

    it('degrades to a "could not load" note instead of throwing when the initial cache read itself fails', async () => {
      pool.query.mockRejectedValue(new Error('connection reset'));
      const result = await executeTool('get_oura_readiness', {}, { userId });
      expect(result).toEqual({ days: [], note: 'Could not load Oura data right now.' });
    });
  });
});
