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

// Garmin is "not connected" (and never a real DB read) unless a test says so.
const { getCoachAccessMock, resetGarminCoachHealth } = require('./stubGarminCoachHealth');
const createCoachModule = require('../aiCoach');

describe('aiCoach buildSystemPrompt Health & Recovery section', () => {
  let buildSystemPrompt;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGarminCoachHealth();
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

  // Garmin (owner decision 10.11.2026) supplements the other sources and is
  // the source only when it is the only one.
  describe('with Garmin connected', () => {
    beforeEach(() => {
      getCoachAccessMock.mockResolvedValue({ connected: true, canRefresh: true });
    });

    it('next to Oura: the Oura section stays, plus how to read Body Battery and stress', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      const prompt = await buildSystemPrompt(undefined, userId);
      expect(prompt).toMatch(/Health & Recovery \(Oura connected\)/);
      expect(prompt).toMatch(/### Garmin \(also connected\)/);
      expect(prompt).toMatch(/never as a replacement for them/);
      expect(prompt).toMatch(/body_battery_high is the day's peak/);
      expect(prompt).not.toMatch(/Health & Recovery \(Garmin connected\)/);
    });

    it('next to Apple Health: the same supplement under the pre-loaded readings', async () => {
      getOuraConnectionStatusMock.mockResolvedValue(null);
      const prompt = await buildSystemPrompt({ recovery_score: 80 }, userId);
      expect(prompt).toMatch(/rider has connected Apple Health/);
      expect(prompt).toMatch(/### Garmin \(also connected\)/);
    });

    it('alone: Garmin is the recovery source, and connecting Apple Health is not suggested', async () => {
      getOuraConnectionStatusMock.mockResolvedValue(null);
      for (const client of ['ios', 'web']) {
        const prompt = await buildSystemPrompt(undefined, userId, { client });
        expect(prompt).toMatch(/Health & Recovery \(Garmin connected\)/);
        expect(prompt).toMatch(/There is no single readiness score from Garmin/);
        expect(prompt).not.toMatch(/### Garmin \(also connected\)/);
        expect(prompt).not.toMatch(/NOT connected Apple Health or Oura/);
        expect(prompt).not.toMatch(/phone integrations/);
      }
    });

    it('old figures are flagged in a clause; the refresh is the app\'s button, not instructions', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      const prompt = await buildSystemPrompt(undefined, userId);
      expect(prompt).toMatch(/When garmin\.stale is true/);
      expect(prompt).toMatch(/do NOT explain how to refresh them/);
    });

    // Owner, 10.11.2026: "Можешь обновить данные гармин?" got "tap the Get
    // Garmin health data button under my reply" — in English, with no button.
    it('a request to refresh Garmin goes through the tool that shows the button, named in the rider\'s language', async () => {
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      const prompt = await buildSystemPrompt(undefined, userId);
      expect(prompt).toMatch(/call suggest_refresh_garmin_health/);
      expect(prompt).toMatch(/never say there is a button without calling the tool/);
      expect(prompt).toMatch(/«Получить данные Garmin Health» in Russian, "Get Garmin health data" in English/);
    });

    it('where the server cannot refresh, the prompt never sends the rider looking for a button', async () => {
      getCoachAccessMock.mockResolvedValue({ connected: true, canRefresh: false });
      getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
      const prompt = await buildSystemPrompt(undefined, userId);
      expect(prompt).toMatch(/### Garmin \(also connected\)/);
      expect(prompt).toMatch(/there is NO refresh button/);
      expect(prompt).not.toMatch(/suggest_refresh_garmin_health/);
      expect(prompt).not.toMatch(/Get Garmin health data/);
    });
  });

  it('says nothing about Garmin when it is not connected', async () => {
    getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
    const prompt = await buildSystemPrompt(undefined, userId);
    expect(prompt).not.toMatch(/Garmin \(also connected\)|Garmin connected\)|Body Battery is Garmin/);
  });

  // Web has no Apple Health (and the suggest_connect_apple_health tool is not
  // offered there — routes/coach.js), so the prompt must not steer the model
  // toward a button that doesn't exist on that client.
  it("uses platform-neutral wording and never names suggest_connect_apple_health for client: 'web' with no health source", async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(undefined, userId, { client: 'web' });
    expect(prompt).toMatch(/Health data comes from the rider's phone integrations \(Apple Health \/ Oura\)/);
    expect(prompt).toMatch(/say so briefly — one short sentence — and continue/);
    expect(prompt).not.toMatch(/NOT connected Apple Health or Oura/);
    expect(prompt).not.toMatch(/call the suggest_connect_apple_health tool/);
  });

  it("keeps the Oura section for client: 'web' when Oura is connected", async () => {
    getOuraConnectionStatusMock.mockResolvedValue({ oura_access_token: 'token123' });
    const prompt = await buildSystemPrompt(undefined, userId, { client: 'web' });
    expect(prompt).toMatch(/rider has connected Oura/);
    expect(prompt).not.toMatch(/phone integrations/);
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
  // 19.11.2026: an 18-week plan went into the calendar three to six sessions per reply.
  it('sends a plan to the calendar whole, through schedule_training_plan', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(null, userId);
    expect(prompt).toMatch(/### Putting a plan in the calendar/);
    expect(prompt).toMatch(/goes into the calendar with schedule_training_plan; create_calendar_event is for single events/);
    expect(prompt).toMatch(/that means ALL of it, in this reply/);
    expect(prompt).toMatch(/you stop only when a result's weeks\.to has reached the plan's last week/);
    expect(prompt).toMatch(/never ask the rider to paste it back/);
    expect(prompt).toMatch(/never present a part as the whole/);
    expect(prompt).toMatch(/the tool refuses a session without blocks, an easy 60′ Z2 ride included/);
    expect(prompt).toMatch(/The race or event the plan leads to is not one of its sessions/);
  });
  // 19.11.2026: a goal running to March was created with 400 km in total.
  it('has a goal for an event or a plan sized for its whole length', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(null, userId);
    expect(prompt).toMatch(/pass create_goal the event day as target_date, and planned_hours_per_week when there is a plan/);
    expect(prompt).toMatch(/correct it with update_goal in the same reply/);
  });
  // 18.11.2026: only one route file could be attached — a stage race is several.
  it('plans every route when several files are attached at once', async () => {
    getOuraConnectionStatusMock.mockResolvedValue(null);
    const prompt = await buildSystemPrompt(null, userId);
    expect(prompt).toMatch(/Several files come as "The user has attached N route files:"/);
    expect(prompt).toMatch(/plan EVERY one — a plan_race call per course_id, all in the same round/);
    expect(prompt).toMatch(/each stage is its own event on its own day, each with its own race_course_id/);
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
