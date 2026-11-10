// Garmin health in the AI coach, on real Postgres (docs/plans/
// garmin-connect-api.md §7; owner decisions 10.11.2026):
//   - Garmin supplements Oura / Apple Health with Body Battery and stress,
//     and is the recovery source only when it is the only one;
//   - when the Garmin figures are old the reply carries a "Get Garmin health
//     data" chip, and POST /api/garmin/connect/sync is what the chip calls.
// OpenAI is mocked (test/fakeResponses.js); Garmin is a fake client.
//
// GARMIN_API must be in the environment before anything under server/ is
// required: config is frozen at first require, and with no key the server
// cannot refresh, so it offers no chip.
process.env.GARMIN_API = 'test-personal-key';

const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');
const { asStream, toolCallEvents, textStream, textResponse } = require('../fakeResponses');

describe('coach + Garmin health', () => {
  let app, pool, coach, repo, refresh, rider, other;
  const today = new Date().toISOString().slice(0, 10);
  const GARMIN_USER_ID = 134506845;

  // A fake Personal API: one item per requested day, like Garmin answers.
  const garminCalls = [];
  const fakeGarmin = {
    userProfilePk: GARMIN_USER_ID,
    get: async (path, params) => {
      garminCalls.push(path);
      if (path.includes('dailysummaries')) {
        return { data: [{ calendarDate: params.endDate, userProfilePk: fakeGarmin.userProfilePk, heartRate: { restingValue: 46 }, stress: { avgLevel: 22, highStressDurationInMillis: 600000 }, bodyBattery: { maxValue: 91, minValue: 35 } }] };
      }
      if (path.includes('dailySleepSummariesByDate')) return [{ calendarDate: params.endDate, sleepTimeSeconds: 27000, sleepScores: { overall: { value: 84 } } }];
      return { userProfilePk: fakeGarmin.userProfilePk, hrvSummaries: [] };
    },
  };

  function chat(token, body) {
    return request(app)
      .post('/api/coach/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .buffer(true)
      .parse((res, callback) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => callback(null, raw));
      });
  }
  const events = (raw) => raw.split('\n\n').filter((f) => f.startsWith('data: ')).map((f) => JSON.parse(f.slice('data: '.length)));

  // Round 1: the model calls analyze_readiness; round 2: it answers.
  function mockReadinessTurn() {
    let streamCalls = 0;
    return vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
      if (params.stream) {
        streamCalls += 1;
        return streamCalls % 2 === 1
          ? asStream(toolCallEvents({ itemId: `fc_${streamCalls}`, callId: `call_${streamCalls}`, name: 'analyze_readiness' }))
          : textStream('Here is how recovered you are.');
      }
      return textResponse(JSON.stringify(['Plan my week']));
    });
  }

  async function askReadiness(user, extra = {}) {
    const spy = mockReadinessTurn();
    try {
      const res = await chat(user.token, { message: 'Am I recovered?', conversation_id: null, ...extra });
      expect(res.status).toBe(200);
      const all = events(res.body);
      return {
        result: all.find((e) => e.type === 'tool_result' && e.name === 'analyze_readiness')?.result,
        suggestions: all.find((e) => e.type === 'suggestions')?.items ?? [],
        instructions: spy.mock.calls.filter((c) => c[0].stream)[0][0].instructions,
      };
    } finally {
      spy.mockRestore();
    }
  }

  const REFRESH_CHIP = { label: 'Get Garmin health data', action: 'refresh_garmin_health' };
  const ageHealthSync = (userId, interval) => pool.query(`UPDATE garmin_health_days SET synced_at = NOW() - INTERVAL '${interval}' WHERE user_id = $1`, [userId]);

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    ({ coach } = require('../../services/coach'));
    repo = require('../../repositories/garminConnect');
    refresh = require('../../services/garminConnect/refresh');
    refresh.personalClient = () => fakeGarmin;
    // Two logins for the whole file — /api/login is rate-limited per IP.
    rider = await createUser(pool, app, request);
    other = await createUser(pool, app, request);

    await repo.upsertConnection(rider.id, { garminUserId: GARMIN_USER_ID, transport: 'personal' });
    await repo.upsertHealthDays(rider.id, [
      { day: today, sleep_seconds: 25200, sleep_score: 78, hrv_last_night_ms: 44.6, hrv_status: 'BALANCED', resting_hr: 48, stress_avg: 31, stress_high_seconds: 2400, body_battery_high: 72, body_battery_low: 18 },
    ]);
    await ageHealthSync(rider.id, '5 hours');
  }, 30000);

  it('Garmin alone: it is the recovery source, with its own sleep / HRV / resting HR, and old figures bring the refresh chip', async () => {
    const { result, suggestions, instructions } = await askReadiness(rider);
    expect(instructions).toMatch(/Health & Recovery \(Garmin connected\)/);
    expect(result).toMatchObject({ connected: true, source: 'garmin', garmin: { stale: true, can_refresh: true } });
    expect(result.garmin.days[0]).toMatchObject({
      day: today,
      sleep_hours: 7,
      sleep_score: 78,
      hrv_ms: 45,
      hrv_status: 'BALANCED',
      resting_hr_bpm: 48,
      body_battery_high: 72,
      body_battery_low: 18,
      stress_avg: 31,
      stress_high_minutes: 40,
    });
    // First in the row, then the model's own suggestions.
    expect(suggestions[0]).toEqual(REFRESH_CHIP);
    expect(suggestions).toContainEqual({ label: 'Plan my week' });
  });

  it("no chip for client: 'web' (no handler there), in Russian for a Russian question", async () => {
    const web = await askReadiness(rider, { client: 'web' });
    expect(web.result.garmin.stale).toBe(true);
    expect(web.suggestions.some((s) => s.action)).toBe(false);

    const spy = mockReadinessTurn();
    try {
      const res = await chat(rider.token, { message: 'Успел ли я восстановиться?', conversation_id: null });
      const ru = events(res.body).find((e) => e.type === 'suggestions').items;
      expect(ru[0]).toEqual({ label: 'Получить данные Garmin Health', action: 'refresh_garmin_health' });
    } finally {
      spy.mockRestore();
    }
  });

  it('the chip\'s endpoint fetches the last days from Garmin; after it the figures are fresh and the chip is gone', async () => {
    garminCalls.length = 0;
    const sync = await request(app).post('/api/garmin/connect/sync').set('Authorization', `Bearer ${rider.token}`);
    expect(sync.status).toBe(200);
    expect(sync.body).toMatchObject({
      synced_days: 1,
      connected: true,
      transport: 'personal',
      health_days: 1,
      last_health_day: today,
      health_latest: { day: today, sleep_hours: 7.5, sleep_score: 84, resting_hr: 46, body_battery_high: 91, body_battery_low: 35, stress_avg: 22 },
    });
    // The HRV the earlier sync stored survives a fetch that brought none.
    expect(sync.body.health_latest.hrv_ms).toBe(45);
    expect(garminCalls).toHaveLength(3);

    // Asked again straight away: answered from what is stored, Garmin not called.
    const again = await request(app).post('/api/garmin/connect/sync').set('Authorization', `Bearer ${rider.token}`);
    expect(again.status).toBe(200);
    expect(again.body.synced_days).toBe(0);
    expect(garminCalls).toHaveLength(3);

    const { result, suggestions } = await askReadiness(rider);
    expect(result.garmin).toMatchObject({ stale: false, can_refresh: true });
    expect(result.garmin.days[0]).toMatchObject({ body_battery_high: 91, stress_avg: 22, sleep_hours: 7.5 });
    expect(suggestions).not.toContainEqual(REFRESH_CHIP);
  });

  // Owner, 10.11.2026: "Можешь обновить данные гармин?" — the coach said
  // "tap the button under my reply" and there was none: the chip only came
  // after a readiness answer on old data.
  describe('an explicit request to refresh Garmin', () => {
    // The model answers in text only — or calls `toolName` first.
    function mockReply(toolName) {
      let streamCalls = 0;
      return vi.spyOn(coach.openai.responses, 'create').mockImplementation(async (params) => {
        if (params.stream) {
          streamCalls += 1;
          if (toolName && streamCalls % 2 === 1) return asStream(toolCallEvents({ itemId: `fc_${streamCalls}`, callId: `call_${streamCalls}`, name: toolName }));
          return textStream('Нажми кнопку под ответом.');
        }
        return textResponse(JSON.stringify([]));
      });
    }
    async function ask(user, message, { toolName, client } = {}) {
      const spy = mockReply(toolName);
      try {
        const res = await chat(user.token, { message, conversation_id: null, ...(client ? { client } : {}) });
        expect(res.status).toBe(200);
        return {
          suggestions: events(res.body).find((e) => e.type === 'suggestions')?.items ?? [],
          tools: spy.mock.calls.filter((c) => c[0].stream)[0][0].tools.map((t) => t.name),
        };
      } finally {
        spy.mockRestore();
      }
    }
    const RU_CHIP = { label: 'Получить данные Garmin Health', action: 'refresh_garmin_health' };

    it('right after a fetch the button does not come back — not even on the app\'s own "Garmin data updated" message', async () => {
      // The previous test fetched seconds ago.
      const followUp = await ask(rider, 'Данные Garmin обновлены — оцени готовность к тренировке ещё раз');
      expect(followUp.suggestions.some((s) => s.action === 'refresh_garmin_health')).toBe(false);
      const again = await ask(rider, 'Можешь обновить данные гармин?', { toolName: 'suggest_refresh_garmin_health' });
      expect(again.suggestions.some((s) => s.action === 'refresh_garmin_health')).toBe(false);
    });

    it('the message itself brings the button, with no tool call and with figures that are not old', async () => {
      await ageHealthSync(rider.id, '10 minutes');
      const { suggestions, tools } = await ask(rider, 'Можешь обновить данные гармин?');
      expect(suggestions[0]).toEqual(RU_CHIP);
      expect(tools).toContain('suggest_refresh_garmin_health');
      expect((await ask(rider, 'Can you sync my Garmin?')).suggestions[0]).toEqual(REFRESH_CHIP);
    });

    it('the model\'s tool brings it for a request the pattern does not catch', async () => {
      const silent = await ask(rider, 'Подгрузи свежий Body Battery с часов');
      expect(silent.suggestions.some((s) => s.action === 'refresh_garmin_health')).toBe(false);
      const viaTool = await ask(rider, 'Подгрузи свежий Body Battery с часов', { toolName: 'suggest_refresh_garmin_health' });
      expect(viaTool.suggestions[0]).toEqual(RU_CHIP);
    });

    it('no button and no tool on the web, or for a rider whose data the server cannot fetch', async () => {
      const web = await ask(rider, 'Можешь обновить данные гармин?', { client: 'web' });
      expect(web.suggestions.some((s) => s.action)).toBe(false);
      expect(web.tools).not.toContain('suggest_refresh_garmin_health');

      const stranger = await ask(other, 'Можешь обновить данные гармин?');
      expect(stranger.suggestions.some((s) => s.action === 'refresh_garmin_health')).toBe(false);
      expect(stranger.tools).not.toContain('suggest_refresh_garmin_health');
    });
  });

  it('next to Oura: Oura is the source, Garmin adds Body Battery and stress only — in the tool result and the feasibility summary', async () => {
    await pool.query("UPDATE users SET oura_access_token = 'oura-token', oura_expires_at = $2 WHERE id = $1", [rider.id, Math.floor(Date.now() / 1000) + 86400]);
    await pool.query(
      `INSERT INTO oura_daily_data (user_id, day, readiness_score, sleep_score, total_sleep_hours, average_hrv, resting_heart_rate, raw, synced_at)
       VALUES ($1, $2, 82, 85, 7.9, 55, 50, '{}'::jsonb, NOW())`,
      [rider.id, today]
    );
    try {
      const { result, instructions } = await askReadiness(rider);
      expect(instructions).toMatch(/Health & Recovery \(Oura connected\)/);
      expect(instructions).toMatch(/### Garmin \(also connected\)/);
      expect(result.source).toBe('oura');
      expect(result.oura.days[0]).toMatchObject({ readiness_score: 82, total_sleep_hours: 7.9 });
      expect(result.garmin.days[0]).toMatchObject({ day: today, body_battery_high: 91, body_battery_low: 35, stress_avg: 22, stress_high_minutes: 10 });
      expect(result.garmin.days[0]).not.toHaveProperty('sleep_hours');
      expect(result.garmin.days[0]).not.toHaveProperty('hrv_ms');

      const feasibility = await coach.executeTool('assess_ride_feasibility', { distance_km: 80 }, { userId: rider.id });
      expect(feasibility.health).toMatchObject({ source: 'oura', readiness: 82, sleepHours: 7.9, bodyBatteryHigh: 91, bodyBatteryLow: 35, stressAvg: 22 });
      expect(feasibility.summary).toContain('Recovery today (Oura): readiness 82, sleep 7.9 h, HRV 55 ms, RHR 50 bpm. Garmin: Body Battery 35–91, stress 22.');
    } finally {
      await pool.query('UPDATE users SET oura_access_token = NULL WHERE id = $1', [rider.id]);
      await pool.query('DELETE FROM oura_daily_data WHERE user_id = $1', [rider.id]);
    }

    // Without Oura again, the feasibility note is Garmin's own.
    const alone = await coach.executeTool('assess_ride_feasibility', { distance_km: 80 }, { userId: rider.id });
    expect(alone.health).toMatchObject({ source: 'garmin', readiness: null, sleepHours: 7.5, restingHr: 46 });
    expect(alone.summary).toContain('Recovery today (Garmin): sleep 7.5 h, HRV 45 ms, RHR 46 bpm, Body Battery 35–91, stress 22.');
  });

  it('the sync endpoint: needs a session, a connection, and one the server can refresh', async () => {
    expect((await request(app).post('/api/garmin/connect/sync')).status).toBe(401);

    const none = await request(app).post('/api/garmin/connect/sync').set('Authorization', `Bearer ${other.token}`);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('GARMIN_NOT_CONNECTED');

    // A Developer-Program connection is not refreshed with the personal key —
    // and, until the AI consent screen exists, is not read by the coach.
    await repo.upsertConnection(other.id, { garminUserId: 'oauth-rider', transport: 'oauth' });
    await repo.upsertHealthDays(other.id, [{ day: today, body_battery_high: 60, stress_avg: 40 }]);
    const oauth = await request(app).post('/api/garmin/connect/sync').set('Authorization', `Bearer ${other.token}`);
    expect(oauth.status).toBe(503);
    expect(oauth.body.code).toBe('GARMIN_REFRESH_UNAVAILABLE');
    const { result, suggestions, instructions } = await askReadiness(other);
    expect(result).toEqual({ connected: false, source: 'none' });
    expect(suggestions.some((s) => s.action === 'refresh_garmin_health')).toBe(false);
    expect(instructions).toMatch(/NOT connected Apple Health or Oura/);
  });

  it('refuses to store anything when the key reads a different Garmin account', async () => {
    await ageHealthSync(rider.id, '2 minutes');
    fakeGarmin.userProfilePk = 555;
    try {
      const res = await request(app).post('/api/garmin/connect/sync').set('Authorization', `Bearer ${rider.token}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GARMIN_ACCOUNT_MISMATCH');
      const [stored] = await repo.getHealthDays(rider.id, { limit: 1 });
      expect(stored.body_battery_high).toBe(91);
    } finally {
      fakeGarmin.userProfilePk = GARMIN_USER_ID;
    }
  });
});
