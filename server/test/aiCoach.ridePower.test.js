// get_ride_power_breakdown coach tool + its system-prompt rule. The service
// is stubbed (no DB/Strava), same convention as test/aiCoach.powerProfile.test.js.
const coachNotesRepo = require('../repositories/coachNotes');
coachNotesRepo.listNotes = vi.fn().mockResolvedValue([]);
const ouraRepo = require('../repositories/oura');
ouraRepo.getOuraConnectionStatus = vi.fn().mockResolvedValue(null);

const rideAnalysisService = require('../services/rideAnalysis');
const getRidePowerBreakdownMock = vi.fn();
rideAnalysisService.getRidePowerBreakdown = getRidePowerBreakdownMock;

// No Garmin for these tests — and no real DB read (see the helper).
require('./stubGarminCoachHealth');
const createCoachModule = require('../aiCoach');

describe('aiCoach get_ride_power_breakdown', () => {
  let coach;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    coach = createCoachModule({
      pool: { query: vi.fn() },
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
  });

  it('is declared with a required activity_id', () => {
    const tool = coach.TOOLS.find((t) => t.function.name === 'get_ride_power_breakdown');
    expect(tool.function.parameters.properties.activity_id.type).toBe('integer');
    expect(tool.function.parameters.required).toEqual(['activity_id']);
    expect(tool.function.description).toMatch(/source:"none"/);
  });

  it('passes the activity id to the service and hands the model the coach view of the result', async () => {
    const breakdown = {
      activity_id: 123,
      source: 'meter',
      np_w: 240,
      segments: [{ kind: 'climb', distance_m: 900, profile: [1, 2, 3] }],
      intervals: {
        threshold_w: 150,
        target: { low: 170, high: 190, source: 'name' },
        blocks: [
          { index: 1, start_s: 600, duration_s: 480, avg_w: 182, avg_hr: 150, in_target_pct: 90, vs_target: 'in' },
          { index: 2, start_s: 1320, duration_s: 480, avg_w: 180, avg_hr: 154, in_target_pct: 88, vs_target: 'in' },
        ],
        set: { reps: 2, blocks: [1, 2], duration_s: 480, rest_s: 240, avg_w: 181, first_w: 182, last_w: 180, fade_pct: -1.1, spread_pct: 1.1, hits: 2 },
      },
    };
    getRidePowerBreakdownMock.mockResolvedValue(breakdown);
    const result = await coach.executeTool('get_ride_power_breakdown', { activity_id: 123 }, { userId });
    expect(getRidePowerBreakdownMock).toHaveBeenCalledWith(userId, 123);
    expect(result.structure).toBe('intervals');
    expect(result.segments).toEqual([{ kind: 'climb', distance_m: 900 }]);
    expect(result.intervals.blocks).toHaveLength(2);
    expect(result.intervals.reading[0]).toBe('Interval set: 2 × 8:00 at 181 W on average (182 / 180 W), rests of about 4:00.');
    expect(result.intervals.reading[2]).toMatch(/^Target 170–190 W \(from the ride's name\): 2 of 2 efforts averaged inside it/);
    // The cached breakdown itself is left alone (the ride screen reads the profiles from it).
    expect(breakdown.segments[0].profile).toEqual([1, 2, 3]);

    const noMeter = { activity_id: 5, source: 'none', note: 'x' };
    getRidePowerBreakdownMock.mockResolvedValue(noMeter);
    expect(await coach.executeTool('get_ride_power_breakdown', { activity_id: 5 }, { userId })).toBe(noMeter);

    getRidePowerBreakdownMock.mockResolvedValue({ activity_id: 6, source: 'meter', np_w: 200, segments: [], intervals: null });
    expect(await coach.executeTool('get_ride_power_breakdown', { activity_id: 6 }, { userId })).toMatchObject({ structure: 'steady', intervals: null });
  });

  it('tells the model when to call it and what to do without a power meter', async () => {
    const prompt = await coach.buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/call get_ride_power_breakdown with that ride's activity_id/);
    expect(prompt).toMatch(/If source is "none" the ride had no power meter/);
    // Interval sessions are judged by their efforts, not by whole-ride averages.
    expect(prompt).toMatch(/you judge it by its blocks and nothing else/);
    expect(prompt).toMatch(/never say the execution "cannot be determined"/);
    expect(prompt).toMatch(/Your reply is the finished answer, never your working/);
  });
});
