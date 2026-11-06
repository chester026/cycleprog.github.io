// services/rideAnalysis.js (docs/plans/coach-ride-power-breakdown.md §2–3)
// with streams, the activity_analysis cache and the power profile stubbed —
// the calc itself is covered in @bikelab/shared (ridePower.test.ts).
const stravaActivities = require('../services/strava/activities');
const stravaTokens = require('../services/strava/tokens');
const { StravaRateLimitError } = require('../services/strava/client');
const activityAnalysisRepo = require('../repositories/activityAnalysis');
const powerProfileService = require('../services/powerProfile');
const bikesRepo = require('../repositories/bikes');
const service = require('../services/rideAnalysis');

const oneHour = (watts) => ({
  watts: { data: Array(3600).fill(watts) },
  time: { data: Array.from({ length: 3600 }, (_, i) => i) },
  velocity_smooth: { data: Array(3600).fill(8) },
  altitude: { data: Array(3600).fill(100) },
});

describe('services/rideAnalysis.getRidePowerBreakdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(activityAnalysisRepo, 'getCachedAnalysis').mockResolvedValue(null);
    vi.spyOn(activityAnalysisRepo, 'saveAnalysis').mockResolvedValue();
    vi.spyOn(powerProfileService, 'getPowerProfile').mockResolvedValue({ ftp: { watts: 250 } });
  });

  it('rejects a non-numeric activity id without touching Strava', async () => {
    const getStreams = vi.spyOn(stravaActivities, 'getStreams');
    const result = await service.getRidePowerBreakdown(7, 'abc');
    expect(result).toMatchObject({ source: 'none' });
    expect(result.note).toMatch(/positive integer/);
    expect(getStreams).not.toHaveBeenCalled();
  });

  it('computes with the rider\'s FTP and caches under kind ride_power', async () => {
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(oneHour(200));
    const result = await service.getRidePowerBreakdown(7, '123');
    expect(result).toMatchObject({ activity_id: 123, ftp_w: 250, source: 'meter', avg_w: 200, np_w: 200, if_: 0.8, tss: 64 });
    expect(result.zones_s).toHaveLength(7);
    expect(result.segments).toHaveLength(1);
    expect(activityAnalysisRepo.saveAnalysis).toHaveBeenCalledWith(7, 123, 'ride_power', {
      version: service.ANALYSIS_VERSION,
      ftp: 250,
      breakdown: result,
    });
  });

  it('serves the cached breakdown without fetching streams, but recomputes a stale version or a changed FTP', async () => {
    const getStreams = vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(oneHour(200));
    const cachedBreakdown = { activity_id: 5, source: 'meter', np_w: 999 };
    activityAnalysisRepo.getCachedAnalysis.mockResolvedValueOnce({ result: { version: service.ANALYSIS_VERSION, ftp: 250, breakdown: cachedBreakdown } });
    expect(await service.getRidePowerBreakdown(7, 5)).toBe(cachedBreakdown);
    expect(getStreams).not.toHaveBeenCalled();

    activityAnalysisRepo.getCachedAnalysis.mockResolvedValueOnce({ result: { version: 0, ftp: 250, breakdown: cachedBreakdown } });
    const fresh = await service.getRidePowerBreakdown(7, 5);
    expect(fresh.np_w).toBe(200);
    expect(getStreams).toHaveBeenCalledTimes(1);

    // FTP moved since the cache was written (a new best, a manual entry) → IF/TSS recomputed
    activityAnalysisRepo.getCachedAnalysis.mockResolvedValueOnce({ result: { version: service.ANALYSIS_VERSION, ftp: 238, breakdown: cachedBreakdown } });
    const moved = await service.getRidePowerBreakdown(7, 5);
    expect(moved.ftp_w).toBe(250);
    expect(getStreams).toHaveBeenCalledTimes(2);
  });

  it('a ride without a watts stream is source "none" with a note and the segment table', async () => {
    const streams = oneHour(0);
    delete streams.watts;
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(streams);
    const result = await service.getRidePowerBreakdown(7, 9);
    expect(result.source).toBe('none');
    expect(result.note).toMatch(/No power-meter data/);
    expect(result.segments[0]).toMatchObject({ kind: 'flat', avg_w: null, avg_speed_kmh: 28.8 });
  });

  it('computes without an FTP when the power profile is unavailable', async () => {
    powerProfileService.getPowerProfile.mockRejectedValue(new Error('profile down'));
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(oneHour(200));
    const result = await service.getRidePowerBreakdown(7, 11);
    expect(result).toMatchObject({ ftp_w: null, if_: null, tss: null, zones_s: [] });
  });

  it('maps Strava failures to a "none" result with a note instead of throwing', async () => {
    const getStreams = vi.spyOn(stravaActivities, 'getStreams');
    getStreams.mockRejectedValueOnce(new stravaTokens.StravaNotLinkedError('not linked'));
    expect((await service.getRidePowerBreakdown(7, 1)).note).toMatch(/not linked/);
    getStreams.mockRejectedValueOnce(new StravaRateLimitError());
    expect((await service.getRidePowerBreakdown(7, 2)).note).toMatch(/rate limit/);
    const upstream = new Error('boom');
    upstream.response = { status: 503 };
    getStreams.mockRejectedValueOnce(upstream);
    expect((await service.getRidePowerBreakdown(7, 3)).note).toMatch(/503/);
    expect(activityAnalysisRepo.saveAnalysis).not.toHaveBeenCalled();
  });

  it('a cache write failure does not fail the call', async () => {
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(oneHour(200));
    activityAnalysisRepo.saveAnalysis.mockRejectedValue(new Error('db down'));
    const result = await service.getRidePowerBreakdown(7, 4);
    expect(result.source).toBe('meter');
  });
});

describe('services/rideAnalysis.getRidePowerInsights', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(activityAnalysisRepo, 'getCachedAnalysis').mockResolvedValue(null);
    vi.spyOn(activityAnalysisRepo, 'saveAnalysis').mockResolvedValue();
    vi.spyOn(powerProfileService, 'getPowerProfile').mockResolvedValue({ ftp: { watts: 250 } });
    vi.spyOn(bikesRepo, 'getRiderWeight').mockResolvedValue(70);
  });

  it('skips the history read for a ride without a power meter', async () => {
    const s = oneHour(0);
    delete s.watts;
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(s);
    const history = vi.spyOn(powerProfileService, 'getRideEffortsHistory');
    const result = await service.getRidePowerInsights(7, 1);
    expect(result.insights).toBeNull();
    expect(result.breakdown.source).toBe('none');
    expect(history).not.toHaveBeenCalled();
  });

  it('ranks the ride in the history and marks a rate-limited history as partial', async () => {
    vi.spyOn(stravaActivities, 'getStreams').mockResolvedValue(oneHour(200));
    vi.spyOn(powerProfileService, 'getRideEffortsHistory').mockResolvedValue({
      rides: [{ activityId: 2, date: '2026-10-01', efforts: { 1200: 260 } }],
      activities: [{ id: 1, start_date: '2026-11-01T08:00:00Z' }],
      partial: false,
    });
    const ok = await service.getRidePowerInsights(7, 1);
    expect(ok.insights).toMatchObject({ weeks: service.INSIGHTS_WEEKS, partial: false, intensity: 'tempo' });
    expect(ok.insights.efforts.find((e) => e.seconds === 1200)).toMatchObject({ watts: 200, best_watts: 260, rank: 2, total: 2 });
    expect(ok.insights.efforts.find((e) => e.seconds === 5)).toMatchObject({ rank: 1, is_pr: true });
    // FTP 250 from the profile; before this ride the window's best 20 min was 260 → 247
    expect(ok.insights.ftp).toEqual({ watts: 250, w_per_kg: 3.57, delta_w: 3 });

    powerProfileService.getRideEffortsHistory.mockRejectedValueOnce(new StravaRateLimitError());
    const limited = await service.getRidePowerInsights(7, 1);
    expect(limited.insights.partial).toBe(true);
    expect(limited.insights.efforts.find((e) => e.seconds === 1200)).toMatchObject({ rank: 1, total: 1 });

    powerProfileService.getRideEffortsHistory.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getRidePowerInsights(7, 1)).rejects.toThrow('db down');
  });
});
