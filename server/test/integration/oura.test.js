const request = require('supertest');
const { bootstrap } = require('./setup');
const { createUser } = require('./helpers');

// S-28 (T-4.1 DoD leftover, audit ouraService.js:267-328): fetchAndCacheOuraData
// used to INSERT one row per day in a loop; it's now a single UNNEST upsert
// (repositories/oura.js#upsertDailyDataBatch). This exercises POST /api/oura/sync
// end-to-end against a mocked Oura HTTP client, asserting the batched upsert
// produces the same per-day rows the old loop did, and is idempotent on
// re-sync (ON CONFLICT (user_id, day) DO UPDATE, not a duplicate insert).
describe('POST /api/oura/sync (batched daily-data upsert)', () => {
  let app, pool, user;

  const DAYS = ['2026-01-01', '2026-01-02', '2026-01-03'];

  beforeAll(async () => {
    ({ app, pool } = await bootstrap());
    user = await createUser(pool, app, request, { email: `oura-${Date.now()}@example.com` });

    // Pretend this user already connected Oura, with a still-valid token
    // (far-future expiry) so getValidAccessToken() never needs to hit the
    // token-refresh endpoint.
    await pool.query(
      `UPDATE users SET oura_access_token = $1, oura_refresh_token = $2, oura_expires_at = $3, oura_user_id = $4 WHERE id = $5`,
      ['test-access-token', 'test-refresh-token', Math.floor(Date.now() / 1000) + 3600, 'oura-user-1', user.id]
    );
  }, 30000);

  function mockOuraHttp({ readiness, sleep, activity, sleepPeriods }) {
    const http = require('../../lib/http');
    http.externalHttp.get = async (url) => {
      if (url.endsWith('/daily_readiness')) return { data: { data: readiness } };
      if (url.endsWith('/daily_sleep')) return { data: { data: sleep } };
      if (url.endsWith('/daily_activity')) return { data: { data: activity } };
      if (url.endsWith('/sleep')) return { data: { data: sleepPeriods } };
      if (url.endsWith('/daily_stress')) return { data: { data: [] } };
      if (url.endsWith('/daily_resilience')) return { data: { data: [] } };
      if (url.endsWith('/daily_spo2')) return { data: { data: [] } };
      throw new Error(`unexpected GET ${url}`);
    };
  }

  it('upserts one row per day for a 3-day payload', async () => {
    mockOuraHttp({
      readiness: DAYS.map((day) => ({ day, score: 70, temperature_deviation: 0.1 })),
      sleep: DAYS.map((day) => ({ day, score: 80 })),
      activity: DAYS.map((day) => ({ day, score: 90 })),
      sleepPeriods: DAYS.map((day) => ({
        day,
        average_hrv: 55,
        average_heart_rate: 50,
        lowest_heart_rate: 45,
        total_sleep_duration: 25200, // 7h, in seconds
      })),
    });

    const res = await request(app)
      .post('/api/oura/sync')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ days: 3 });

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(3);
    expect(res.body.days.slice().sort()).toEqual(DAYS.slice().sort());

    const { rows } = await pool.query(
      'SELECT day, readiness_score, sleep_score, activity_score, average_hrv, resting_heart_rate, min_heart_rate, total_sleep_hours FROM oura_daily_data WHERE user_id = $1 ORDER BY day',
      [user.id]
    );
    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      expect(row.readiness_score).toBe(70);
      expect(row.sleep_score).toBe(80);
      expect(row.activity_score).toBe(90);
      expect(Number(row.average_hrv)).toBe(55);
      expect(Number(row.resting_heart_rate)).toBe(50);
      expect(Number(row.min_heart_rate)).toBe(45);
      expect(Number(row.total_sleep_hours)).toBe(7);
    });
  });

  it('re-syncing the same 3 days is idempotent (upsert, not duplicate rows) and picks up new values', async () => {
    // Different scores this time, to confirm ON CONFLICT ... DO UPDATE
    // actually overwrites rather than silently no-op'ing.
    mockOuraHttp({
      readiness: DAYS.map((day) => ({ day, score: 71, temperature_deviation: 0.2 })),
      sleep: DAYS.map((day) => ({ day, score: 81 })),
      activity: DAYS.map((day) => ({ day, score: 91 })),
      sleepPeriods: DAYS.map((day) => ({
        day,
        average_hrv: 56,
        average_heart_rate: 51,
        lowest_heart_rate: 46,
        total_sleep_duration: 25200,
      })),
    });

    const res = await request(app)
      .post('/api/oura/sync')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ days: 3 });

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(3);

    const { rows } = await pool.query(
      'SELECT day, readiness_score, sleep_score, activity_score FROM oura_daily_data WHERE user_id = $1 ORDER BY day',
      [user.id]
    );
    // Still exactly 3 rows for this user — the second sync updated the
    // existing rows rather than inserting 3 more.
    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      expect(row.readiness_score).toBe(71);
      expect(row.sleep_score).toBe(81);
      expect(row.activity_score).toBe(91);
    });
  });
});
