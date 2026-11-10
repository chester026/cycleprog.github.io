// services/garminConnect/refresh.js — the rider's own "fetch my Garmin health
// data now" (POST /api/garmin/connect/sync). Repository, sync and status are
// stubbed (require-cache convention); the real path is
// test/integration/coachGarminHealth.test.js.
const garminConnectRepo = require('../repositories/garminConnect');
const getConnection = vi.fn();
const getHealthStats = vi.fn();
garminConnectRepo.getConnection = (...a) => getConnection(...a);
garminConnectRepo.getHealthStats = (...a) => getHealthStats(...a);

const personalSync = require('../services/garminConnect/personalSync');
const syncPersonalHealth = vi.fn();
personalSync.syncPersonalHealth = (...a) => syncPersonalHealth(...a);

const connection = require('../services/garminConnect/connection');
const getStatus = vi.fn();
connection.getStatus = (...a) => getStatus(...a);

const coachHealth = require('../services/garminConnect/coachHealth');
const canRefresh = vi.fn();
coachHealth.canRefresh = (...a) => canRefresh(...a);

const refresh = require('../services/garminConnect/refresh');
const fakeClient = { get: vi.fn() };
refresh.personalClient = () => fakeClient;

const NOW = Date.parse('2026-11-10T09:00:00Z');
const STATUS = { connected: true, transport: 'personal', health_days: 30 };

describe('Garmin health refresh', () => {
  beforeEach(() => {
    for (const mock of [getConnection, getHealthStats, syncPersonalHealth, getStatus, canRefresh]) mock.mockReset();
    getConnection.mockResolvedValue({ user_id: 7, transport: 'personal', garmin_user_id: '134506845' });
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - 4 * 3600 * 1000) });
    syncPersonalHealth.mockResolvedValue({ days: 3, missed: [], rateLimited: false });
    getStatus.mockResolvedValue(STATUS);
    canRefresh.mockReturnValue(true);
  });

  it('fetches the last three days for the connected account and returns the new status', async () => {
    const result = await refresh.refreshHealth(7, { now: NOW });
    expect(syncPersonalHealth).toHaveBeenCalledWith(7, fakeClient, { days: 3, pauseMs: 0, expectGarminUserId: '134506845' });
    expect(result).toEqual({ synced_days: 3, ...STATUS });
  });

  it('a second request within a minute is answered from what is stored, without calling Garmin', async () => {
    getHealthStats.mockResolvedValue({ last_health_sync_at: new Date(NOW - 20 * 1000) });
    const result = await refresh.refreshHealth(7, { now: NOW });
    expect(syncPersonalHealth).not.toHaveBeenCalled();
    expect(result).toEqual({ synced_days: 0, ...STATUS });
  });

  it('fetches when nothing was ever synced', async () => {
    getHealthStats.mockResolvedValue({ last_health_sync_at: null });
    await refresh.refreshHealth(7, { now: NOW });
    expect(syncPersonalHealth).toHaveBeenCalledTimes(1);
  });

  it('409 without a connection, 503 for a connection the server cannot refresh', async () => {
    getConnection.mockResolvedValue(null);
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toMatchObject({ status: 409, code: 'GARMIN_NOT_CONNECTED' });
    getConnection.mockResolvedValue({ user_id: 7, transport: 'oauth' });
    canRefresh.mockReturnValue(false);
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toMatchObject({ status: 503, code: 'GARMIN_REFRESH_UNAVAILABLE' });
    expect(syncPersonalHealth).not.toHaveBeenCalled();
  });

  it('refuses when the key reads a different Garmin account than the connection', async () => {
    syncPersonalHealth.mockRejectedValue(Object.assign(new Error('different account'), { code: 'GARMIN_ACCOUNT_MISMATCH' }));
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toMatchObject({ status: 409, code: 'GARMIN_ACCOUNT_MISMATCH' });
  });

  it("429 on Garmin's rate limit, 502 when none of the three requests answered", async () => {
    syncPersonalHealth.mockResolvedValue({ days: 0, missed: [], rateLimited: true });
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    syncPersonalHealth.mockResolvedValue({ days: 0, rateLimited: false, missed: [{ part: 'summaries', status: 401 }, { part: 'sleep', status: 401 }, { part: 'hrv', status: 401 }] });
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toMatchObject({ status: 502, code: 'UPSTREAM_ERROR' });
  });

  it('an account without sleep or HRV tracking is not an outage', async () => {
    syncPersonalHealth.mockResolvedValue({ days: 3, rateLimited: false, missed: [{ part: 'sleep', status: 404 }, { part: 'hrv', status: 404 }] });
    await expect(refresh.refreshHealth(7, { now: NOW })).resolves.toMatchObject({ synced_days: 3 });
    // Nothing measured in the window at all, but Garmin answered: zero days, no error.
    syncPersonalHealth.mockResolvedValue({ days: 0, rateLimited: false, missed: [] });
    await expect(refresh.refreshHealth(7, { now: NOW })).resolves.toMatchObject({ synced_days: 0 });
  });

  it('lets an unexpected failure through', async () => {
    syncPersonalHealth.mockRejectedValue(new Error('connection lost'));
    await expect(refresh.refreshHealth(7, { now: NOW })).rejects.toThrow('connection lost');
  });
});
