// get_power_profile coach tool + its system-prompt rule. The service is
// stubbed (no DB/Strava), same convention as test/aiCoach.memory.test.js.
const coachNotesRepo = require('../repositories/coachNotes');
coachNotesRepo.listNotes = vi.fn().mockResolvedValue([]);
const ouraRepo = require('../repositories/oura');
ouraRepo.getOuraConnectionStatus = vi.fn().mockResolvedValue(null);

const powerProfileService = require('../services/powerProfile');
const getPowerProfileMock = vi.fn();
powerProfileService.getPowerProfile = getPowerProfileMock;

const createCoachModule = require('../aiCoach');

describe('aiCoach get_power_profile', () => {
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

  it('is declared with an optional weeks parameter', () => {
    const tool = coach.TOOLS.find((t) => t.function.name === 'get_power_profile');
    expect(tool.function.parameters.properties.weeks.type).toBe('integer');
    expect(tool.function.parameters.required).toEqual([]);
  });

  it('returns the service result as-is, defaulting to 12 weeks', async () => {
    const profile = { weeks: 12, ftp: { watts: 249, method: 'ftp20' } };
    getPowerProfileMock.mockResolvedValue(profile);
    const result = await coach.executeTool('get_power_profile', {}, { userId });
    expect(result).toBe(profile);
    expect(getPowerProfileMock).toHaveBeenCalledWith(userId, { weeks: 12 });
  });

  it('clamps weeks to 1-52', async () => {
    getPowerProfileMock.mockResolvedValue({});
    await coach.executeTool('get_power_profile', { weeks: 200 }, { userId });
    await coach.executeTool('get_power_profile', { weeks: 26 }, { userId });
    expect(getPowerProfileMock.mock.calls.map((c) => c[1].weeks)).toEqual([52, 26]);
  });

  it('tells the model to quote the tool for FTP/zones and never derive it from average_watts', async () => {
    const prompt = await coach.buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/call get_power_profile and quote its numbers/);
    expect(prompt).toMatch(/Never derive FTP or power from average_watts/);
    expect(prompt).toMatch(/20-minute test protocol/);
  });
});
