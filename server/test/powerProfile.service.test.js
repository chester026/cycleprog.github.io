// services/powerProfile.js with the activity list, streams, cache and
// weight stubbed — covers the branches the integration test doesn't: partial
// analysis (fetch budget), a short-rides-only rider, rate-limit stop.
const stravaActivities = require('../services/strava/activities');
const activityAnalysisRepo = require('../repositories/activityAnalysis');
const bikesRepo = require('../repositories/bikes');
const { StravaRateLimitError } = require('../services/strava/client');
const service = require('../services/powerProfile');

const NOW = Date.now();
const ride = (id, movingTime = 3600) => ({
  id,
  start_date: new Date(NOW - 86400000).toISOString(),
  moving_time: movingTime,
  average_watts: 200,
  device_watts: true,
});
const streams = (watts) => ({ watts: { data: watts }, time: { data: watts.map((_, i) => i) } });

describe('services/powerProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(activityAnalysisRepo, 'getCachedAnalysis').mockResolvedValue(null);
    vi.spyOn(activityAnalysisRepo, 'saveAnalysis').mockResolvedValue();
    vi.spyOn(bikesRepo, 'getRiderWeight').mockResolvedValue(null);
  });

  it('computeRideEfforts handles a missing watts stream and a missing time stream', () => {
    expect(service.computeRideEfforts({ heartrate: { data: [1] } })).toEqual({});
    expect(service.computeRideEfforts({ watts: { data: Array(60).fill(200) } })).toEqual({ 5: 200, 60: 200 });
  });

  it('only short rides: no FTP, says so, and leaves W/kg and zones empty', async () => {
    vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([ride(1, 900)]);
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(streams(Array(600).fill(250)));
    const result = await service.getPowerProfile(7, { weeks: 4 });
    expect(result).toMatchObject({ weeks: 4, ridesWithPower: 1, ftp: null, wPerKg: null, zones: [] });
    expect(result.bestEfforts['300'].watts).toBe(250);
    expect(result.note).toMatch(/20-minute/);
  });

  it('reports partial analysis once the uncached fetch budget is spent', async () => {
    const many = Array.from({ length: service.MAX_UNCACHED_STREAM_FETCHES + 3 }, (_, i) => ride(100 + i));
    vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue(many);
    const getStreams = vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(streams(Array(1300).fill(220)));
    const result = await service.getPowerProfile(7);
    expect(getStreams).toHaveBeenCalledTimes(service.MAX_UNCACHED_STREAM_FETCHES);
    expect(result.ridesAnalyzed).toBe(service.MAX_UNCACHED_STREAM_FETCHES);
    expect(result.ridesWithPower).toBe(many.length);
    expect(result.note).toMatch(/Analyzed 20 of 23/);
    expect(result.ftp).toMatchObject({ watts: 209, method: 'ftp20' });
  });

  it('stops fetching when Strava rate-limits and keeps what it has', async () => {
    vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([ride(1), ride(2), ride(3)]);
    const getStreams = vi
      .spyOn(stravaActivities, 'getStreams')
      .mockResolvedValueOnce(streams(Array(1300).fill(200)))
      .mockRejectedValueOnce(new StravaRateLimitError('limit', 900));
    const result = await service.getPowerProfile(7);
    expect(getStreams).toHaveBeenCalledTimes(2);
    expect(result.ridesAnalyzed).toBe(1);
    expect(result.note).toMatch(/Analyzed 1 of 3/);
  });

  it('skips a ride whose stream fetch fails for another reason but keeps going', async () => {
    vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([ride(1), ride(2)]);
    vi.spyOn(stravaActivities, 'getStreams')
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(streams(Array(3700).fill(180)));
    const result = await service.getPowerProfile(7);
    expect(result.ridesAnalyzed).toBe(1);
    expect(result.ftp).toMatchObject({ watts: 171, method: 'ftp20' });
  });

  it('uses the rider weight for W/kg', async () => {
    vi.spyOn(bikesRepo, 'getRiderWeight').mockResolvedValue(80);
    vi.spyOn(stravaActivities, 'getActivities').mockResolvedValue([ride(1)]);
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(streams(Array(1300).fill(200)));
    expect((await service.getPowerProfile(7)).wPerKg).toBe(2.38);
  });
});
