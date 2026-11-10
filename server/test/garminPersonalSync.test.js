// services/garminConnect/personalSync.js — the personal-key backfill loop,
// with a fake Garmin client and the repository + ingest stubbed
// (require-cache convention, see test/hrZones.service.test.js).
const garminConnectRepo = require('../repositories/garminConnect');
const upsertConnection = vi.fn();
const getIngestedVersions = vi.fn();
const touchLastSync = vi.fn();
const getConnection = vi.fn();
const upsertHealthDays = vi.fn();
garminConnectRepo.getConnection = (...a) => getConnection(...a);
garminConnectRepo.upsertHealthDays = (...a) => upsertHealthDays(...a);
garminConnectRepo.upsertConnection = (...a) => upsertConnection(...a);
garminConnectRepo.getIngestedVersions = (...a) => getIngestedVersions(...a);
garminConnectRepo.touchLastSync = (...a) => touchLastSync(...a);

const ingest = require('../services/garminConnect/ingest');
const ingestActivityFile = vi.fn();
ingest.ingestActivityFile = (...a) => ingestActivityFile(...a);

const zipLib = require('../lib/zip');
const readZip = vi.fn();
zipLib.readZip = (...a) => readZip(...a);

const { syncPersonalAccount, syncPersonalHealth, listActivities, healthChunks, PAGE_SIZE } = require('../services/garminConnect/personalSync');
const { ANALYSIS_VERSION } = require('../services/garminConnect/analyze');

const activity = (id, typeKey = 'cycling', extra = {}) => ({
  activityId: id,
  activityName: `Ride ${id}`,
  startTimeGMT: '2026-11-08 09:58:38',
  ownerId: 134506845,
  activityType: { typeKey },
  ...extra,
});

function fakeClient(activities) {
  return {
    get: vi.fn(async (_path, { start, limit }) => activities.slice(start, start + limit)),
    downloadActivityZip: vi.fn(async (id) => Buffer.from(`zip-${id}`)),
  };
}

describe('Garmin personal-key sync', () => {
  beforeEach(() => {
    for (const mock of [upsertConnection, getIngestedVersions, touchLastSync, ingestActivityFile, readZip, getConnection, upsertHealthDays]) mock.mockReset();
    getIngestedVersions.mockResolvedValue(new Map());
    ingestActivityFile.mockImplementation(async (_userId, meta) => ({ status: 'ingested', garmin_activity_id: meta.garminActivityId, type: 'Ride', device_watts: true }));
    readZip.mockImplementation((zip) => [{ name: `${String(zip).slice(4)}_ACTIVITY.fit`, data: Buffer.from(`fit-${String(zip).slice(4)}`) }]);
  });

  it('pages through the whole activity list', async () => {
    const all = Array.from({ length: PAGE_SIZE + 7 }, (_, i) => activity(i + 1));
    const client = fakeClient(all);
    expect(await listActivities(client)).toHaveLength(PAGE_SIZE + 7);
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get.mock.calls[1][1]).toEqual({ start: PAGE_SIZE, limit: PAGE_SIZE });
  });

  it('connects the rider, downloads only rides, ingests each and stamps the sync', async () => {
    const client = fakeClient([activity(3, 'road_biking'), activity(2, 'running'), activity(1, 'virtual_ride'), activity(9, 'breathwork')]);
    const progress = vi.fn();
    const summary = await syncPersonalAccount(7, client, { pauseMs: 0, onProgress: progress });

    expect(upsertConnection).toHaveBeenCalledWith(7, { garminUserId: 134506845, transport: 'personal' });
    expect(client.downloadActivityZip.mock.calls.map((c) => c[0])).toEqual([3, 1]);
    expect(ingestActivityFile).toHaveBeenCalledWith(7, { garminActivityId: 3, name: 'Ride 3' }, Buffer.from('fit-3'));
    expect(touchLastSync).toHaveBeenCalledWith(7);
    expect(summary).toEqual({ listed: 4, rides: 2, upToDate: 0, ingested: 2, skipped: {}, failed: [], pending: 0, rateLimited: false });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('skips rides already stored at the current analysis version; --force and an older version redo them', async () => {
    getIngestedVersions.mockResolvedValue(new Map([[1, ANALYSIS_VERSION], [2, ANALYSIS_VERSION - 1]]));
    const client = fakeClient([activity(1), activity(2), activity(3)]);
    const summary = await syncPersonalAccount(7, client, { pauseMs: 0 });
    expect(summary).toMatchObject({ upToDate: 1, ingested: 2 });
    expect(client.downloadActivityZip.mock.calls.map((c) => c[0])).toEqual([2, 3]);

    const forced = await syncPersonalAccount(7, fakeClient([activity(1), activity(2), activity(3)]), { pauseMs: 0, force: true });
    expect(forced).toMatchObject({ upToDate: 0, ingested: 3 });
  });

  it('counts why a ride was not stored: no FIT in the ZIP, or the file says it is not a ride', async () => {
    readZip.mockImplementation((zip) => (String(zip) === 'zip-1' ? [{ name: 'activity_1.gpx', data: Buffer.from('<gpx/>') }] : [{ name: 'x.FIT', data: Buffer.from('fit') }]));
    ingestActivityFile.mockResolvedValue({ status: 'skipped', reason: 'not_a_ride', sport: 'walking' });
    const summary = await syncPersonalAccount(7, fakeClient([activity(1), activity(2)]), { pauseMs: 0 });
    expect(summary.skipped).toEqual({ no_fit_file: 1, not_a_ride: 1 });
    expect(summary.ingested).toBe(0);
    expect(ingestActivityFile).toHaveBeenCalledTimes(1);
  });

  it('a failed ride does not stop the run; a 429 does, leaving the rest for next time', async () => {
    const client = fakeClient([activity(1), activity(2), activity(3), activity(4)]);
    client.downloadActivityZip.mockImplementation(async (id) => {
      if (id === 1) throw Object.assign(new Error('Garmin Personal API 500'), { status: 500 });
      if (id === 3) throw Object.assign(new Error('Garmin Personal API 429'), { status: 429 });
      return Buffer.from(`zip-${id}`);
    });
    const summary = await syncPersonalAccount(7, client, { pauseMs: 0 });
    expect(summary).toMatchObject({ ingested: 1, failed: [{ id: 1, error: 'Garmin Personal API 500' }], rateLimited: true, pending: 2 });
    expect(client.downloadActivityZip).toHaveBeenCalledTimes(3);
    expect(touchLastSync).toHaveBeenCalled();
  });

  it('honours --limit, and reads from the FIT cache instead of Garmin when it can', async () => {
    const client = fakeClient([activity(1), activity(2), activity(3)]);
    const written = [];
    const fitCache = { read: (id) => (id === 1 ? Buffer.from('cached-1') : null), write: (id, bytes) => written.push([id, String(bytes)]) };
    const summary = await syncPersonalAccount(7, client, { pauseMs: 0, limit: 2, fitCache });
    expect(summary).toMatchObject({ ingested: 2, pending: 1 });
    expect(client.downloadActivityZip.mock.calls.map((c) => c[0])).toEqual([2]);
    expect(ingestActivityFile.mock.calls[0][2]).toEqual(Buffer.from('cached-1'));
    expect(written).toEqual([[2, 'fit-2']]);
  });

  it('a dry run lists and counts, and writes nothing', async () => {
    getIngestedVersions.mockResolvedValue(new Map([[1, ANALYSIS_VERSION]]));
    const client = fakeClient([activity(1), activity(2), activity(3, 'running')]);
    const summary = await syncPersonalAccount(7, client, { dryRun: true });
    expect(summary).toMatchObject({ listed: 3, rides: 2, upToDate: 1, pending: 1, ingested: 0 });
    expect(upsertConnection).not.toHaveBeenCalled();
    expect(client.downloadActivityZip).not.toHaveBeenCalled();
    expect(ingestActivityFile).not.toHaveBeenCalled();
    expect(touchLastSync).not.toHaveBeenCalled();
  });

  it('refuses to connect when Garmin does not say whose account this is', async () => {
    await expect(syncPersonalAccount(7, fakeClient([]), { pauseMs: 0 })).rejects.toThrow(/ownerId/);
    expect(upsertConnection).not.toHaveBeenCalled();
  });
});

// The health half: three range requests a chunk → garmin_health_days rows.
describe('Garmin personal-key health sync', () => {
  const SUMMARIES = '/usersummary-service/v2/dailysummaries';
  const SLEEP = '/sleep-service/sleep/dailySleepSummariesByDate';

  const daySummary = (calendarDate) => ({ calendarDate, userProfilePk: 134506845, heartRate: { restingValue: 47 }, bodyBattery: { maxValue: 88, minValue: 19 } });
  const nightOf = (calendarDate) => ({ calendarDate, sleepTimeSeconds: 25200 });

  // Answers each request with one item per requested day (or what `answers` says).
  function healthClient(answers = {}) {
    const daysBetween = (from, to) => {
      const out = [];
      for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
      return out;
    };
    return {
      get: vi.fn(async (path, params) => {
        if (path === SUMMARIES) return answers.summaries ? answers.summaries(params) : { data: daysBetween(params.startDate, params.endDate).map(daySummary) };
        if (path === SLEEP) return answers.sleep ? answers.sleep(params) : daysBetween(params.startDate, params.endDate).map(nightOf);
        const [, from, to] = path.match(/hrv\/daily\/(.+)\/(.+)$/);
        return answers.hrv ? answers.hrv({ from, to }) : { userProfilePk: 134506845, hrvSummaries: [{ calendarDate: to, lastNightAvg: 48, status: 'BALANCED' }] };
      }),
    };
  }

  beforeEach(() => {
    for (const mock of [upsertConnection, touchLastSync, getConnection, upsertHealthDays]) mock.mockReset();
    getConnection.mockResolvedValue({ user_id: 7, transport: 'personal' });
    upsertHealthDays.mockImplementation(async (_userId, rows) => rows.length);
  });

  it('splits the window into chunks of at most four weeks, ending today', () => {
    expect(healthChunks(1, '2026-11-10')).toEqual([{ from: '2026-11-10', to: '2026-11-10' }]);
    expect(healthChunks(30, '2026-11-10')).toEqual([{ from: '2026-10-12', to: '2026-11-08' }, { from: '2026-11-09', to: '2026-11-10' }]);
    expect(healthChunks(56, '2026-03-01')).toEqual([{ from: '2026-01-05', to: '2026-02-01' }, { from: '2026-02-02', to: '2026-03-01' }]);
  });

  it('fetches summaries, sleep and HRV for the window and stores one row a day', async () => {
    const client = healthClient();
    const summary = await syncPersonalHealth(7, client, { days: 3, today: '2026-11-10', pauseMs: 0 });

    expect(client.get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [SUMMARIES, { startDate: '2026-11-08', endDate: '2026-11-10' }],
      [SLEEP, { startDate: '2026-11-08', endDate: '2026-11-10' }],
      ['/hrv-service/hrv/daily/2026-11-08/2026-11-10', undefined],
    ]);
    expect(upsertHealthDays).toHaveBeenCalledTimes(1);
    const [userId, rows] = upsertHealthDays.mock.calls[0];
    expect(userId).toBe(7);
    expect(rows.map((r) => r.day)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
    expect(rows[2]).toMatchObject({ resting_hr: 47, body_battery_high: 88, sleep_seconds: 25200, hrv_last_night_ms: 48, hrv_status: 'BALANCED' });
    expect(summary).toMatchObject({ from: '2026-11-08', to: '2026-11-10', days: 3, withSleep: 3, withHrv: 1, missed: [], rateLimited: false });
    expect(summary.latest.map((r) => r.day)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08']);
    expect(touchLastSync).toHaveBeenCalledWith(7);
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it('a longer window is several chunks, and `latest` is the newest seven days', async () => {
    const client = healthClient();
    const summary = await syncPersonalHealth(7, client, { days: 40, today: '2026-11-10', pauseMs: 0 });
    expect(client.get).toHaveBeenCalledTimes(6);
    expect(upsertHealthDays).toHaveBeenCalledTimes(2);
    expect(summary.days).toBe(40);
    expect(summary.latest).toHaveLength(7);
    expect(summary.latest[0].day).toBe('2026-11-10');
    expect(summary.latest[6].day).toBe('2026-11-04');
  });

  it('an endpoint that fails costs its columns, not the sync — and is reported once', async () => {
    const client = healthClient({
      sleep: () => { throw Object.assign(new Error('Garmin Personal API 404'), { status: 404 }); },
      hrv: () => { throw new Error('socket hang up'); },
    });
    const summary = await syncPersonalHealth(7, client, { days: 40, today: '2026-11-10', pauseMs: 0 });
    expect(summary).toMatchObject({ days: 40, withSleep: 0, withHrv: 0, rateLimited: false });
    expect(summary.missed).toEqual([{ part: 'sleep', status: 404 }, { part: 'hrv', status: null }]);
    expect(upsertHealthDays.mock.calls[0][1][0]).toMatchObject({ resting_hr: 47, sleep_seconds: null });
  });

  it('a 429 stops the run and keeps what the earlier chunks stored', async () => {
    let calls = 0;
    const client = healthClient({
      sleep: (params) => {
        calls += 1;
        if (calls === 2) throw Object.assign(new Error('Garmin Personal API 429'), { status: 429 });
        return [nightOf(params.endDate)];
      },
    });
    const summary = await syncPersonalHealth(7, client, { days: 80, today: '2026-11-10', pauseMs: 0 });
    expect(summary.rateLimited).toBe(true);
    expect(summary.days).toBe(28);
    expect(upsertHealthDays).toHaveBeenCalledTimes(1);
    expect(touchLastSync).toHaveBeenCalled();
  });

  it('connects the rider from the payload when the ride sync has not done it yet', async () => {
    getConnection.mockResolvedValue(null);
    await syncPersonalHealth(7, healthClient(), { days: 2, today: '2026-11-10', pauseMs: 0 });
    expect(upsertConnection).toHaveBeenCalledWith(7, { garminUserId: 134506845, transport: 'personal' });
    expect(upsertConnection.mock.invocationCallOrder[0]).toBeLessThan(upsertHealthDays.mock.invocationCallOrder[0]);

    upsertConnection.mockReset();
    const anonymous = healthClient({ summaries: (p) => ({ data: [{ calendarDate: p.endDate, heartRate: { restingValue: 50 } }] }), hrv: () => ({ hrvSummaries: [] }) });
    await expect(syncPersonalHealth(7, anonymous, { days: 1, today: '2026-11-10', pauseMs: 0 })).rejects.toThrow(/userProfilePk/);
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it('refuses to store data of a Garmin account other than the one the rider connected', async () => {
    const mismatch = syncPersonalHealth(7, healthClient(), { days: 2, today: '2026-11-10', pauseMs: 0, expectGarminUserId: '999' });
    await expect(mismatch).rejects.toMatchObject({ code: 'GARMIN_ACCOUNT_MISMATCH' });
    expect(upsertHealthDays).not.toHaveBeenCalled();

    // The same account (number or string) goes through.
    await syncPersonalHealth(7, healthClient(), { days: 2, today: '2026-11-10', pauseMs: 0, expectGarminUserId: '134506845' });
    expect(upsertHealthDays).toHaveBeenCalledTimes(1);
  });

  it('an account with no health data stores nothing and connects nothing', async () => {
    getConnection.mockResolvedValue(null);
    const client = healthClient({ summaries: () => ({ data: [] }), sleep: () => [], hrv: () => ({ hrvSummaries: [] }) });
    const summary = await syncPersonalHealth(7, client, { days: 5, today: '2026-11-10', pauseMs: 0 });
    expect(summary).toMatchObject({ days: 0, latest: [] });
    expect(upsertConnection).not.toHaveBeenCalled();
    expect(touchLastSync).not.toHaveBeenCalled();
  });

  it('a dry run fetches and maps, and writes nothing', async () => {
    getConnection.mockResolvedValue(null);
    const summary = await syncPersonalHealth(7, healthClient(), { days: 3, today: '2026-11-10', dryRun: true });
    expect(summary).toMatchObject({ days: 3, withSleep: 3 });
    expect(summary.latest).toHaveLength(3);
    expect(upsertHealthDays).not.toHaveBeenCalled();
    expect(upsertConnection).not.toHaveBeenCalled();
    expect(touchLastSync).not.toHaveBeenCalled();
  });
});
