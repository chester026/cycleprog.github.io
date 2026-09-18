// Unit tests for services/power.js (T-3.5, docs/audit/00-AUDIT-AND-PLAN.md
// T-3.5) with pool.query/getUserProfile/getWindForActivity stubbed — no
// real DB or network. Following this repo's require-cache-stub convention
// (see test/skills.service.test.js / test/strava.tokens.test.js).
const { pool } = require('../db');
const queryMock = vi.fn();
pool.query = (...args) => queryMock(...args);

const recommendations = require('../recommendations');
const getUserProfileMock = vi.fn();
recommendations.getUserProfile = getUserProfileMock;

const weatherService = require('../services/weather');
const getWindForActivityMock = vi.fn();
weatherService.getWindForActivity = getWindForActivityMock;

const { enrichEstimatedPower, MAX_WEATHER_CALLS_PER_REQUEST } = require('../services/power');

function activity(overrides = {}) {
  return {
    id: 1,
    distance: 20000,
    moving_time: 2400,
    total_elevation_gain: 0,
    average_speed: 20000 / 2400,
    start_date: new Date().toISOString(),
    start_latlng: [35.1, 33.4],
    estimated_power: null,
    ...overrides,
  };
}

describe('services/power enrichEstimatedPower', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getUserProfileMock.mockReset();
    getWindForActivityMock.mockReset();
    getUserProfileMock.mockResolvedValue({ weight: 70, bike_weight: 8 });
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('is a no-op (no query, no weather call) when every activity already has an estimate', async () => {
    const activities = [activity({ estimated_power: { avgWatts: 150, method: 'estimated', confidence: 'low' } })];
    await enrichEstimatedPower(1, activities);
    expect(queryMock).not.toHaveBeenCalled();
    expect(getWindForActivityMock).not.toHaveBeenCalled();
  });

  it('passes measured power straight through for a device_watts activity, without a weather call', async () => {
    const activities = [activity({ device_watts: true, average_watts: 210 })];
    await enrichEstimatedPower(1, activities);
    expect(activities[0].estimated_power.method).toBe('measured');
    expect(activities[0].estimated_power.avgWatts).toBe(210);
    expect(getWindForActivityMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/UPDATE synced_activities/);
  });

  it('fetches wind for a recent activity with coordinates and marks hasWind', async () => {
    getWindForActivityMock.mockResolvedValue({ speedMs: 4, directionDeg: 90 });
    const activities = [activity()];
    await enrichEstimatedPower(1, activities);
    expect(getWindForActivityMock).toHaveBeenCalledTimes(1);
    expect(activities[0].estimated_power.hasWind).toBe(true);
    expect(activities[0].estimated_power.method).toBe('estimated');
  });

  it('fetches wind for a 400-day-old ride (archive window), but skips beyond the 3-year lookback', async () => {
    const old = activity({ start_date: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString() });
    await enrichEstimatedPower(1, [old]);
    expect(getWindForActivityMock).toHaveBeenCalledTimes(1);
    getWindForActivityMock.mockClear();
    const ancient = activity({ id: 77, start_date: new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString() });
    await enrichEstimatedPower(1, [ancient]);
    expect(getWindForActivityMock).not.toHaveBeenCalled();
    expect(ancient.estimated_power.hasWind).toBe(false);
    expect(ancient.estimated_power.avgWatts).not.toBeNull();
  });

  it('retries a legacy row that was persisted windless while eligible for wind', async () => {
    getWindForActivityMock.mockResolvedValue({ speedMs: 4, directionDeg: 90 });
    const legacy = activity({ estimated_power: { avgWatts: 100, method: 'estimated', confidence: 0.5, hasWind: false } });
    await enrichEstimatedPower(1, [legacy]);
    expect(getWindForActivityMock).toHaveBeenCalledTimes(1);
    expect(legacy.estimated_power.hasWind).toBe(true);
  });

  it('skips wind for an activity without coordinates', async () => {
    const noCoords = activity({ start_latlng: null });
    await enrichEstimatedPower(1, [noCoords]);
    expect(getWindForActivityMock).not.toHaveBeenCalled();
    expect(noCoords.estimated_power.hasWind).toBe(false);
  });

  it('continues (windless estimate) when the weather fetch fails, and still persists it', async () => {
    getWindForActivityMock.mockRejectedValue(new Error('upstream down'));
    const activities = [activity()];
    await enrichEstimatedPower(1, activities);
    expect(activities[0].estimated_power.avgWatts).not.toBeNull();
    expect(activities[0].estimated_power.hasWind).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1); // still persisted — it was tried, just failed
  });

  it('caps upstream weather calls at MAX_WEATHER_CALLS_PER_REQUEST and leaves the rest unpersisted', async () => {
    getWindForActivityMock.mockResolvedValue({ speedMs: 3, directionDeg: 10 });
    const many = Array.from({ length: MAX_WEATHER_CALLS_PER_REQUEST + 5 }, (_, i) => activity({ id: i }));

    await enrichEstimatedPower(1, many);

    expect(getWindForActivityMock).toHaveBeenCalledTimes(MAX_WEATHER_CALLS_PER_REQUEST);
    // every activity still gets a value on the in-memory object for this response...
    expect(many.every((a) => a.estimated_power && a.estimated_power.avgWatts !== undefined)).toBe(true);
    // ...but only the ones that got a real wind attempt were persisted.
    const persistedIds = queryMock.mock.calls[0][1][1];
    expect(persistedIds).toHaveLength(MAX_WEATHER_CALLS_PER_REQUEST);
  });

  it('falls back to default rider/bike weight when the profile has none', async () => {
    getUserProfileMock.mockResolvedValue(null);
    const activities = [activity()];
    getWindForActivityMock.mockResolvedValue(null);
    await enrichEstimatedPower(1, activities);
    expect(activities[0].estimated_power.avgWatts).not.toBeNull();
  });

  it('never throws when the profile load fails', async () => {
    getUserProfileMock.mockRejectedValue(new Error('db down'));
    getWindForActivityMock.mockResolvedValue(null);
    const activities = [activity()];
    await expect(enrichEstimatedPower(1, activities)).resolves.toBe(activities);
  });
});
