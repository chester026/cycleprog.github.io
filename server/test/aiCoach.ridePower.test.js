// get_ride_power_breakdown coach tool + its system-prompt rule. The service
// is stubbed (no DB/Strava), same convention as test/aiCoach.powerProfile.test.js.
const coachNotesRepo = require('../repositories/coachNotes');
coachNotesRepo.listNotes = vi.fn().mockResolvedValue([]);
const ouraRepo = require('../repositories/oura');
ouraRepo.getOuraConnectionStatus = vi.fn().mockResolvedValue(null);

const rideAnalysisService = require('../services/rideAnalysis');
const getRidePowerBreakdownMock = vi.fn();
rideAnalysisService.getRidePowerBreakdown = getRidePowerBreakdownMock;

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

  it('passes the activity id to the service and returns its result as-is', async () => {
    const breakdown = { activity_id: 123, source: 'meter', np_w: 240 };
    getRidePowerBreakdownMock.mockResolvedValue(breakdown);
    const result = await coach.executeTool('get_ride_power_breakdown', { activity_id: 123 }, { userId });
    expect(result).toBe(breakdown);
    expect(getRidePowerBreakdownMock).toHaveBeenCalledWith(userId, 123);
  });

  it('tells the model when to call it and what to do without a power meter', async () => {
    const prompt = await coach.buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/call get_ride_power_breakdown with that ride's activity_id/);
    expect(prompt).toMatch(/If source is "none" the ride had no power meter/);
  });
});
