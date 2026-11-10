// services/garminConnect/ingest.js — FIT file in, one stored row out. The
// repository is stubbed (require-cache convention, see
// test/hrZones.service.test.js); the real-Postgres path is
// test/integration/garminConnect.test.js.
const garminConnectRepo = require('../repositories/garminConnect');
const upsertActivityMock = vi.fn();
garminConnectRepo.upsertActivity = (...args) => upsertActivityMock(...args);

const { ingestActivityFile, buildActivity } = require('../services/garminConnect/ingest');
const { ANALYSIS_VERSION, decodeChart } = require('../services/garminConnect/analyze');
const { SUMMARY_COLUMNS } = require('../repositories/garminConnect');
const { buildFitRide, steadySamples } = require('./fixtures/fitRide');

describe('Garmin ingest', () => {
  beforeEach(() => {
    upsertActivityMock.mockReset();
    upsertActivityMock.mockResolvedValue(undefined);
  });

  it('builds a row carrying every stored column, the analysis and the chart', async () => {
    const fit = await buildFitRide({ samples: steadySamples({ seconds: 900 }) });
    const built = await buildActivity({ garminActivityId: '25008462265', name: 'Morning ride' }, fit);
    expect(built.status).toBe('ready');
    const { activity } = built;
    expect(activity.garmin_activity_id).toBe(25008462265);
    expect(activity.name).toBe('Morning ride');
    expect(activity.type).toBe('Ride');
    for (const column of SUMMARY_COLUMNS) expect(activity).toHaveProperty(column);
    expect(activity.analysis_version).toBe(ANALYSIS_VERSION);
    expect(activity.analysis.breakdown.avg_w).toBe(200);
    expect(activity.analysis.breakdown.best_efforts_w).toMatchObject({ 5: 200, 60: 200, 300: 200 });
    expect(activity.provider.ftp_w).toBe(250);
    expect(decodeChart(activity.chart).watts.data).toHaveLength(600);
  });

  it('stores the ride and reports what it stored', async () => {
    const fit = await buildFitRide();
    const result = await ingestActivityFile(7, { garminActivityId: 42, name: null }, fit);
    expect(result).toEqual({
      status: 'ingested',
      garmin_activity_id: 42,
      type: 'Ride',
      start_date: '2026-06-01T06:00:00.000Z',
      device_watts: true,
    });
    expect(upsertActivityMock).toHaveBeenCalledTimes(1);
    const [userId, activity] = upsertActivityMock.mock.calls[0];
    expect(userId).toBe(7);
    expect(activity.garmin_activity_id).toBe(42);
    expect(activity.name).toBeNull();
  });

  it.each([
    ['a run', { sport: 'running', subSport: 'generic' }, { status: 'skipped', reason: 'not_a_ride', sport: 'running' }],
    ['a multisport file', { sessions: 2 }, { status: 'skipped', reason: 'multi_session' }],
    ['a file with no session', { sessions: 0 }, { status: 'skipped', reason: 'no_session' }],
  ])('skips %s without touching the database', async (_label, options, expected) => {
    const result = await ingestActivityFile(7, { garminActivityId: 1 }, await buildFitRide(options));
    expect(result).toEqual(expected);
    expect(upsertActivityMock).not.toHaveBeenCalled();
  });

  it('skips bytes that are not a FIT file (an imported GPX/TCX original)', async () => {
    const result = await ingestActivityFile(7, { garminActivityId: 1 }, Buffer.from('<?xml version="1.0"?><gpx></gpx>'));
    expect(result).toEqual({ status: 'skipped', reason: 'not_fit' });
    expect(upsertActivityMock).not.toHaveBeenCalled();
  });

  it('lets a database failure through — the caller decides what a failed ride means', async () => {
    upsertActivityMock.mockRejectedValue(new Error('connection lost'));
    await expect(ingestActivityFile(7, { garminActivityId: 1 }, await buildFitRide())).rejects.toThrow('connection lost');
  });
});
