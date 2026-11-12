// services/garminConnect/coachHealth.js — Garmin health days as the coach
// reads them. The repository is stubbed (require-cache convention).
const garminConnectRepo = require('../repositories/garminConnect');
const getConnection = vi.fn();
const getHealthDays = vi.fn();
const getHealthStats = vi.fn();
garminConnectRepo.getConnection = (...a) => getConnection(...a);
garminConnectRepo.getHealthDays = (...a) => getHealthDays(...a);
garminConnectRepo.getHealthStats = (...a) => getHealthStats(...a);

const { getCoachHealth, getCoachAccess, wasJustSynced, JUST_SYNCED_MS, supplement, toCoachDay, canRefresh, STALE_AFTER_MS } = require('../services/garminConnect/coachHealth');

const NOW = Date.parse('2026-11-10T09:00:00Z');
const row = (overrides = {}) => ({
  day: '2026-11-10',
  sleep_seconds: 25980,
  deep_sleep_seconds: 5400,
  light_sleep_seconds: 14400,
  rem_sleep_seconds: 6180,
  awake_seconds: 900,
  nap_seconds: null,
  sleep_score: 81,
  sleep_avg_hr: 51.2,
  sleep_avg_stress: 17.4,
  sleep_respiration: 13.3,
  spo2_avg: 95.4,
  hrv_last_night_ms: 48.2,
  hrv_weekly_avg_ms: 46,
  hrv_status: 'BALANCED',
  resting_hr: 47,
  min_hr: 44,
  max_hr: 171,
  stress_avg: 28,
  stress_max: 91,
  stress_qualifier: 'BALANCED',
  stress_rest_seconds: 30600,
  stress_low_seconds: 14400,
  stress_medium_seconds: 5400,
  stress_high_seconds: 1800,
  body_battery_high: 88,
  body_battery_low: 19,
  body_battery_charged: 71,
  body_battery_drained: 64,
  respiration_avg: 14.5,
  steps: 6421,
  ...overrides,
});

describe('Garmin health for the coach', () => {
  beforeEach(() => {
    for (const mock of [getConnection, getHealthDays, getHealthStats]) mock.mockReset();
    getConnection.mockResolvedValue({ user_id: 7, transport: 'personal', garmin_user_id: '134506845' });
    getHealthDays.mockResolvedValue([row()]);
    getHealthStats.mockResolvedValue({ health_days: 30, last_health_day: '2026-11-10', last_health_sync_at: new Date(NOW - 10 * 60 * 1000) });
  });

  it('maps a stored day into named, unit-carrying fields', () => {
    expect(toCoachDay(row())).toEqual({
      day: '2026-11-10',
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
    });
    expect(toCoachDay(row({ sleep_seconds: null, hrv_last_night_ms: null, stress_high_seconds: null }))).toMatchObject({
      sleep_hours: null,
      hrv_ms: null,
      stress_high_minutes: null,
    });
  });

  it('returns the recent days, newest first as stored, with freshness and whether a refresh is possible', async () => {
    getHealthDays.mockResolvedValue([row(), row({ day: '2026-11-09', body_battery_high: 70 })]);
    const health = await getCoachHealth(7, { now: NOW, apiKey: 'key' });
    expect(getHealthDays).toHaveBeenCalledWith(7, { limit: 7 });
    expect(health.days.map((d) => d.day)).toEqual(['2026-11-10', '2026-11-09']);
    expect(health).toMatchObject({ as_of: new Date(NOW - 10 * 60 * 1000).toISOString(), stale: false, can_refresh: true });
  });

  it('is stale past three hours or when never fetched, fresh just inside', async () => {
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - STALE_AFTER_MS - 1000) });
    expect((await getCoachHealth(7, { now: NOW, apiKey: 'key' })).stale).toBe(true);
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - STALE_AFTER_MS + 1000) });
    expect((await getCoachHealth(7, { now: NOW, apiKey: 'key' })).stale).toBe(false);
    getHealthStats.mockResolvedValue({ health_days: 0, last_health_day: null, last_health_sync_at: null });
    getHealthDays.mockResolvedValue([]);
    expect(await getCoachHealth(7, { now: NOW, apiKey: 'key' })).toEqual({ days: [], as_of: null, stale: true, can_refresh: true });
  });

  it('can refresh only a personal-key connection, and only when the server has the key', async () => {
    expect(canRefresh({ transport: 'personal' }, 'key')).toBe(true);
    expect(canRefresh({ transport: 'personal' }, '')).toBe(false);
    expect(canRefresh({ transport: 'personal' }, null)).toBe(false);
    expect(canRefresh({ transport: 'oauth' }, 'key')).toBe(false);
    expect((await getCoachHealth(7, { now: NOW, apiKey: null })).can_refresh).toBe(false);
  });

  it('knows a fetch that has only just happened — no point offering another', async () => {
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - 30 * 1000) });
    expect(await wasJustSynced(7, { now: NOW })).toBe(true);
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - JUST_SYNCED_MS - 1000) });
    expect(await wasJustSynced(7, { now: NOW })).toBe(false);
    getHealthStats.mockResolvedValue({ last_health_sync_at: null });
    expect(await wasJustSynced(7, { now: NOW })).toBe(false);
    getConnection.mockResolvedValue(null);
    expect(await wasJustSynced(7, { now: NOW })).toBe(false);
  });

  it('bounds how many days it reads', async () => {
    await getCoachHealth(7, { days: 500, now: NOW });
    await getCoachHealth(7, { days: 0, now: NOW });
    await getCoachHealth(7, { days: '3', now: NOW });
    expect(getHealthDays.mock.calls.map((c) => c[1].limit)).toEqual([30, 7, 3]);
  });

  it('is null — no Garmin for the coach — without a user, without a connection, or for an OAuth connection (no AI consent yet)', async () => {
    expect(await getCoachHealth(null)).toBeNull();
    getConnection.mockResolvedValue(null);
    const NONE = { connected: false, canRefresh: false };
    expect(await getCoachHealth(7)).toBeNull();
    expect(await getCoachAccess(7, { apiKey: 'key' })).toEqual(NONE);
    getConnection.mockResolvedValue({ user_id: 7, transport: 'oauth' });
    expect(await getCoachHealth(7)).toBeNull();
    expect(await getCoachAccess(7, { apiKey: 'key' })).toEqual(NONE);
    expect(getHealthDays).not.toHaveBeenCalled();
    getConnection.mockResolvedValue({ user_id: 7, transport: 'personal' });
    expect(await getCoachAccess(7, { apiKey: 'key' })).toEqual({ connected: true, canRefresh: true });
    // Connected, but the server has no key: readable, not refreshable.
    expect(await getCoachAccess(7, { apiKey: '' })).toEqual({ connected: true, canRefresh: false });
    expect(await getCoachAccess(undefined, { apiKey: 'key' })).toEqual(NONE);
  });

  it('never throws: a failed read is "no Garmin", not a failed coach turn', async () => {
    getConnection.mockRejectedValue(new Error('connection reset'));
    expect(await getCoachHealth(7)).toBeNull();
    expect(await getCoachAccess(7, { apiKey: 'key' })).toEqual({ connected: false, canRefresh: false });
    getConnection.mockResolvedValue({ user_id: 7, transport: 'personal' });
    getHealthDays.mockRejectedValue(new Error('relation does not exist'));
    expect(await getCoachHealth(7)).toBeNull();
  });

  it('supplement keeps only what Garmin alone has, and only days that have it', async () => {
    getHealthDays.mockResolvedValue([row(), row({ day: '2026-11-09', body_battery_high: null, body_battery_low: null, stress_avg: null })]);
    const health = await getCoachHealth(7, { now: NOW, apiKey: 'key' });
    const reduced = supplement(health);
    expect(reduced.days).toEqual([
      {
        day: '2026-11-10',
        body_battery_high: 88,
        body_battery_low: 19,
        body_battery_charged: 71,
        body_battery_drained: 64,
        stress_avg: 28,
        stress_qualifier: 'BALANCED',
        stress_high_minutes: 30,
        stress_rest_minutes: 510,
      },
    ]);
    expect(reduced).toMatchObject({ as_of: health.as_of, stale: false, can_refresh: true });
    // The full payload is left as it was.
    expect(health.days).toHaveLength(2);
    expect(health.days[0].sleep_hours).toBe(7.2);
    expect(supplement(null)).toBeNull();
  });
});
