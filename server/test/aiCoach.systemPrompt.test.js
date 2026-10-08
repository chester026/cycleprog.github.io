// Unit tests for buildSystemPrompt's Health & Recovery section (repositories/
// coachNotes.js and repositories/oura.js stubbed — no real DB connection,
// same convention as test/aiCoach.memory.test.js). Covers the three
// healthContext/Oura combinations: an Oura-connected rider with no Apple
// Health used to be told by this same prompt to connect Apple Health, which
// is what these guard against regressing.
const coachNotesRepo = require('../repositories/coachNotes');
const listNotesMock = vi.fn();
coachNotesRepo.listNotes = listNotesMock;

const ouraRepo = require('../repositories/oura');
const getOuraConnectionStatusMock = vi.fn();
ouraRepo.getOuraConnectionStatus = getOuraConnectionStatusMock;

const createCoachModule = require('../aiCoach');

describe('aiCoach buildSystemPrompt Health & Recovery section', () => {
  let buildSystemPrompt;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    listNotesMock.mockResolvedValue([]);
    const coach = createCoachModule({
      pool: { query: vi.fn() },
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
    buildSystemPrompt = coach.buildSystemPrompt;
  });

  it('describes real Apple Health readings and calls analyze_readiness when healthContext is present, regardless of Oura', async () => {
    getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
    const prompt = await buildSystemPrompt({ recovery_score: 80 }, userId);
    expect(prompt).toMatch(/rider has connected Apple Health/);
    expect(prompt).not.toMatch(/connect Apple Health would let you factor/);
  });

  it('points to analyze_readiness (which fetches Oura itself), not Apple Health, when only Oura is connected', async () => {
    getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
    const prompt = await buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/rider has connected Oura/);
    expect(prompt).toMatch(/call analyze_readiness whenever they ask/);
    expect(prompt).toMatch(/only call get_oura_readiness instead when they want a deeper multi-day/);
    expect(prompt).not.toMatch(/suggest_connect_apple_health tool/);
    expect(prompt).not.toMatch(/connecting Apple Health would let you factor/);
  });

  it('treats a stale/cleared Oura connection (no access token) as not connected', async () => {
    getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: null });
    const prompt = await buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/NOT connected Apple Health or Oura/);
  });

  it('suggests connecting Apple Health (and calls suggest_connect_apple_health) only when neither source is connected', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/NOT connected Apple Health or Oura/);
    expect(prompt).toMatch(/suggest_connect_apple_health tool/);
  });

  it('tells the model the first-analysis trend chart is automatic and never to claim it can\'t show charts', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(undefined, userId);
    expect(prompt).toMatch(/heart-rate-vs-speed fatigue\/overtraining trend chart/);
    expect(prompt).toMatch(/never say you can't show charts/);
  });

  // 07.10.2026: a 12-week Stelvio plan came back as twelve paragraphs of
  // principles ("устойчиво тяжело", "примерно 2,5–3 часа") with no actual
  // sessions. The prompt now mandates one self-describing line per session.
  it('mandates the one-line workout notation for plans and calendar titles', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(null, userId);
    expect(prompt).toMatch(/## Workouts and plans/);
    expect(prompt).toMatch(/A HEADLINE — one self-describing line/);
    expect(prompt).toMatch(/A BRIEF — 2-4 sentences/);
    expect(prompt).toMatch(/Never create a planned_ride without a description/);
    expect(prompt).toMatch(/No power meter does NOT mean no numbers/);
    expect(prompt).toMatch(/title IS the headline, its description IS the brief/);
  });
  // 07.10.2026: "Стоит мне завтра ехать 160км 3000 набора?" got a paragraph about connecting
  // Apple Health. A described ride is a capability + freshness question answered from Strava.
  it('routes described rides to assess_ride_feasibility and keeps the missing-health note to one sentence', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(null, userId);
    expect(prompt).toMatch(/## Can I do this ride\?/);
    expect(prompt).toMatch(/Call assess_ride_feasibility and read its summary line first/);
    expect(prompt).toMatch(/FIRST sentence is the verdict: "yes", "yes, with conditions" or "not yet"/);
    expect(prompt).toMatch(/calendar in ONE clause/);
    expect(prompt).toMatch(/at most ONE short sentence at the end/);
    expect(prompt).toMatch(/Don't refuse or discourage a ride just because the plan had an easy day/);
  });
});
