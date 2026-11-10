// services/garminConnect/personalHealth.js — the Personal API's daily
// summary / sleep / HRV payloads → garmin_health_days rows. The payloads
// below follow the field names scripts/garmin-probe.js recorded on a real
// account; the values are made up.
const { mapPersonalHealth, mapDailySummary, mapSleep, mapHrv, garminUserIdOf } = require('../services/garminConnect/personalHealth');
const { HEALTH_COLUMNS } = require('../services/garminConnect/healthColumns');
const { latestHealth } = require('../services/garminConnect/connection');

const summary = (calendarDate, overrides = {}) => ({
  uuid: 'x',
  userProfilePk: 134506845,
  calendarDate,
  includesWellnessData: true,
  movement: { steps: { goal: 8000, value: 6421, distanceInMeters: 4800 } },
  heartRate: { minValue: 44, maxValue: 171, restingValue: 47 },
  stress: {
    avgLevel: 28,
    maxLevel: 91,
    qualifier: 'BALANCED',
    totalDurationInMillis: 80000000,
    restDurationInMillis: 30600000,
    lowStressDurationInMillis: 14400000,
    mediumStressDurationInMillis: 5400000,
    highStressDurationInMillis: 1800000,
  },
  bodyBattery: { minValue: 19, maxValue: 88, chargedValue: 71, drainedValue: 64, latestValue: 40 },
  respiration: { avgValue: 14.52, maxValue: 21, minValue: 9 },
  ...overrides,
});

const night = (calendarDate, overrides = {}) => ({
  calendarDate,
  sleepTimeSeconds: 25980,
  napTimeSeconds: 0,
  deepSleepSeconds: 5400,
  lightSleepSeconds: 14400,
  remSleepSeconds: 6180,
  awakeSleepSeconds: 900,
  averageSpO2Value: 95.4,
  averageRespirationValue: 13.26,
  avgSleepStress: 17.4,
  avgHeartRate: 51.2,
  sleepScores: { overall: { value: 81, qualifierKey: 'GOOD' } },
  ...overrides,
});

// What Garmin returns for a night the watch was not worn (seen by the probe):
// every sleep field null, including calendarDate.
const noNight = (calendarDate) => ({
  calendarDate: null,
  sleepTimeSeconds: null,
  napTimeSeconds: 0,
  deepSleepSeconds: null,
  sleepNeed: { calendarDate, baseline: 480, actual: 500 },
});

describe('mapPersonalHealth', () => {
  it('merges the three payloads into one row per day, oldest first, with every column present', () => {
    const rows = mapPersonalHealth({
      summaries: { data: [summary('2026-11-09'), summary('2026-11-08', { heartRate: { restingValue: 49 } })] },
      sleep: [night('2026-11-09')],
      hrv: { userProfilePk: 134506845, hrvSummaries: [{ calendarDate: '2026-11-09', weeklyAvg: 46, lastNightAvg: 48.24, status: 'BALANCED' }] },
    });
    expect(rows.map((r) => r.day)).toEqual(['2026-11-08', '2026-11-09']);
    for (const row of rows) expect(Object.keys(row)).toEqual(['day', ...HEALTH_COLUMNS]);
    expect(rows[1]).toEqual({
      day: '2026-11-09',
      sleep_seconds: 25980,
      deep_sleep_seconds: 5400,
      light_sleep_seconds: 14400,
      rem_sleep_seconds: 6180,
      awake_seconds: 900,
      nap_seconds: null,
      sleep_score: 81,
      sleep_avg_hr: 51.2,
      sleep_avg_stress: 17.4,
      sleep_respiration: 13.3,
      spo2_avg: 95.4,
      hrv_last_night_ms: 48.2,
      hrv_weekly_avg_ms: 46,
      hrv_status: 'BALANCED',
      resting_hr: 47,
      min_hr: 44,
      max_hr: 171,
      stress_avg: 28,
      stress_max: 91,
      stress_qualifier: 'BALANCED',
      stress_rest_seconds: 30600,
      stress_low_seconds: 14400,
      stress_medium_seconds: 5400,
      stress_high_seconds: 1800,
      body_battery_high: 88,
      body_battery_low: 19,
      body_battery_charged: 71,
      body_battery_drained: 64,
      respiration_avg: 14.5,
      steps: 6421,
    });
    // The day without a night or an HRV reading keeps its daytime figures.
    expect(rows[0]).toMatchObject({ resting_hr: 49, min_hr: null, stress_avg: 28, sleep_seconds: null, sleep_score: null, hrv_last_night_ms: null });
  });

  it('a night the watch was not worn adds no sleep, and does not hide the day', () => {
    const rows = mapPersonalHealth({ summaries: { data: [summary('2026-11-10')] }, sleep: [noNight('2026-11-10')] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: '2026-11-10', sleep_seconds: null, deep_sleep_seconds: null, nap_seconds: null, resting_hr: 47 });
  });

  it('works with any of the payloads missing — an endpoint that 404s costs its columns only', () => {
    expect(mapPersonalHealth({ summaries: null, sleep: [night('2026-11-09')], hrv: null })).toMatchObject([{ day: '2026-11-09', sleep_seconds: 25980, resting_hr: null }]);
    expect(mapPersonalHealth({ hrv: { hrvSummaries: [{ calendarDate: '2026-11-09', lastNightAvg: 52 }] } })).toMatchObject([{ hrv_last_night_ms: 52, hrv_status: null }]);
    expect(mapPersonalHealth({})).toEqual([]);
    expect(mapPersonalHealth()).toEqual([]);
    expect(mapPersonalHealth({ summaries: 'nope', sleep: {}, hrv: [] })).toEqual([]);
  });

  it('drops a day with nothing measured, a day with steps only, and an item without a usable date', () => {
    const empty = { calendarDate: '2026-11-07', includesWellnessData: false, movement: { steps: { value: 312 } }, heartRate: {}, stress: {}, bodyBattery: {} };
    const rows = mapPersonalHealth({ summaries: { data: [empty, summary(undefined), summary('09.11.2026'), summary('2026-11-06')] } });
    expect(rows.map((r) => r.day)).toEqual(['2026-11-06']);
  });
});

describe('field mapping', () => {
  it("treats Garmin's negative no-data markers and zeros-that-mean-nothing as null", () => {
    const row = mapDailySummary({
      heartRate: { restingValue: 0, minValue: -1, maxValue: null },
      stress: { avgLevel: -1, maxLevel: -2, qualifier: '  ', highStressDurationInMillis: -1 },
      bodyBattery: { minValue: null, maxValue: undefined, chargedValue: 0, drainedValue: 12 },
      respiration: { avgValue: 0 },
    });
    expect(row).toMatchObject({
      resting_hr: null,
      min_hr: null,
      max_hr: null,
      stress_avg: null,
      stress_max: null,
      stress_qualifier: null,
      stress_high_seconds: null,
      body_battery_high: null,
      body_battery_low: null,
      body_battery_charged: 0,
      body_battery_drained: 12,
      respiration_avg: null,
      steps: null,
    });
    expect(mapDailySummary(undefined).resting_hr).toBeNull();
    expect(mapDailySummary({ heartRate: { restingValue: '47' } }).resting_hr).toBeNull();
  });

  it('rounds to what the columns hold: whole seconds and bpm, one decimal for the rest', () => {
    expect(mapDailySummary({ heartRate: { restingValue: 46.6 }, stress: { restDurationInMillis: 1499 } })).toMatchObject({ resting_hr: 47, stress_rest_seconds: 1 });
    expect(mapSleep({ sleepTimeSeconds: 25980.4, avgHeartRate: 51.26 })).toMatchObject({ sleep_seconds: 25980, sleep_avg_hr: 51.3 });
    expect(mapHrv({ lastNightAvg: 48.26, weeklyAvg: 0, status: 'LOW' })).toEqual({ hrv_last_night_ms: 48.3, hrv_weekly_avg_ms: null, hrv_status: 'LOW' });
  });

  it('finds the sleep score wherever Garmin puts it, and keeps a real nap', () => {
    expect(mapSleep({ sleepScores: { overall: { value: 77 } } }).sleep_score).toBe(77);
    expect(mapSleep({ overallSleepScore: { value: 64 } }).sleep_score).toBe(64);
    expect(mapSleep({ sleepScore: 58 }).sleep_score).toBe(58);
    expect(mapSleep({}).sleep_score).toBeNull();
    expect(mapSleep({ napTimeSeconds: 1500 }).nap_seconds).toBe(1500);
    expect(mapSleep(null).sleep_seconds).toBeNull();
  });
});

describe('garminUserIdOf', () => {
  it('reads the account id from the summaries, else from the HRV payload', () => {
    expect(garminUserIdOf({ summaries: { data: [{ calendarDate: 'x' }, summary('2026-11-09')] } })).toBe(134506845);
    expect(garminUserIdOf({ summaries: { data: [] }, hrv: { userProfilePk: 7 } })).toBe(7);
    expect(garminUserIdOf({})).toBeNull();
    expect(garminUserIdOf()).toBeNull();
  });
});

describe('latestHealth (status endpoint)', () => {
  it('is hours and whole milliseconds, the way the app shows them', () => {
    const [row] = mapPersonalHealth({
      summaries: { data: [summary('2026-11-09')] },
      sleep: [night('2026-11-09')],
      hrv: { hrvSummaries: [{ calendarDate: '2026-11-09', lastNightAvg: 48.24, status: 'BALANCED' }] },
    });
    expect(latestHealth(row)).toEqual({
      day: '2026-11-09',
      sleep_hours: 7.2,
      sleep_score: 81,
      hrv_ms: 48,
      hrv_status: 'BALANCED',
      resting_hr: 47,
      body_battery_high: 88,
      body_battery_low: 19,
      stress_avg: 28,
    });
  });

  it('keeps nulls as nulls and is null without a row', () => {
    const [row] = mapPersonalHealth({ summaries: { data: [summary('2026-11-10')] } });
    expect(latestHealth(row)).toMatchObject({ sleep_hours: null, sleep_score: null, hrv_ms: null, hrv_status: null, resting_hr: 47 });
    expect(latestHealth(undefined)).toBeNull();
  });
});
