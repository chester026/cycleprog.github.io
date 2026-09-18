import { describe, expect, it } from 'vitest';
import { cooperTestVO2max, estimateVO2maxFromActivities, vo2maxCategory, Vo2maxEstimateSchema } from './vo2max.js';
import type { Vo2maxActivityInput } from './vo2max.js';

const NOW = new Date('2026-06-15T00:00:00Z');

function ride(daysAgo: number, overrides: Partial<Vo2maxActivityInput> = {}): Vo2maxActivityInput {
  const start = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    type: 'Ride',
    average_speed: 8, // m/s ≈ 28.8 km/h
    average_heartrate: 140,
    moving_time: 3600,
    distance: 40000,
    start_date: start.toISOString(),
    name: 'Ride',
    ...overrides,
  };
}

describe('estimateVO2maxFromActivities', () => {
  it('returns null/none for an empty activity list', () => {
    const result = estimateVO2maxFromActivities([], null, { now: NOW });
    expect(result).toEqual({ vo2max: null, method: 'none', sampleSize: 0 });
    expect(() => Vo2maxEstimateSchema.parse(result)).not.toThrow();
  });

  it('returns null/none when every activity is filtered out by window/type', () => {
    const acts = [ride(100), { ...ride(1), type: 'Run' }];
    const result = estimateVO2maxFromActivities(acts, null, { now: NOW, windowDays: 28 });
    expect(result).toEqual({ vo2max: null, method: 'none', sampleSize: 0 });
  });

  it('computes a deterministic value for a realistic 10-ride sample', () => {
    const acts: Vo2maxActivityInput[] = [
      ride(1, { average_speed: 9, name: 'Interval session' }),
      ride(3, { average_speed: 8.5 }),
      ride(5, { average_speed: 8, distance: 60000, moving_time: 3 * 3600 }),
      ride(7, { average_speed: 7.5, name: 'Interval repeats' }),
      ride(9, { average_speed: 8.2 }),
      ride(11, { average_speed: 7.8 }),
      ride(13, { average_speed: 8.1, distance: 55000, moving_time: 2.6 * 3600 }),
      ride(15, { average_speed: 7.9 }),
      ride(17, { average_speed: 8.3 }),
      ride(19, { average_speed: 8.0 }),
    ];
    const profile = { age: 32, weight: 72, gender: 'male', resting_hr: 55, max_hr: 188 };
    const result = estimateVO2maxFromActivities(acts, profile, { now: NOW });

    expect(result.method).toBe('hr-speed');
    expect(result.sampleSize).toBe(10);
    // Snapshot value computed from the ported formula — see module doc for
    // the derivation (bestSpeed 9 m/s = 32.4 km/h -> base 1.8*32.4+10=68.32,
    // age/gender/HR/fitness adjustments applied on top, clamped to [25,80]).
    expect(result.vo2max).toBe(75);
    expect(result.details?.intervalsCount).toBe(2);
    expect(result.details?.longRidesCount).toBe(2);
  });

  it('excludes activities outside the default 28-day window', () => {
    const acts = [ride(1), ride(200)];
    const result = estimateVO2maxFromActivities(acts, null, { now: NOW });
    expect(result.sampleSize).toBe(1);
  });

  it('includes all activities when windowDays is null (caller already filtered by period)', () => {
    const acts = [ride(1), ride(200)];
    const result = estimateVO2maxFromActivities(acts, null, { now: NOW, windowDays: null });
    expect(result.sampleSize).toBe(2);
  });

  it('only counts Ride/VirtualRide by default, ignoring other activity types', () => {
    const acts = [ride(1), ride(2, { type: 'Run' }), ride(3, { type: 'VirtualRide' })];
    const result = estimateVO2maxFromActivities(acts, null, { now: NOW });
    expect(result.sampleSize).toBe(2);
  });

  it('respects a custom types list', () => {
    const acts = [ride(1), ride(2, { type: 'Run' })];
    const result = estimateVO2maxFromActivities(acts, null, { now: NOW, types: ['Run'] });
    expect(result.sampleSize).toBe(1);
  });

  it('falls back to profile defaults (age 35, gender male, resting 60, max 220-age) when profile is missing', () => {
    const withProfile = estimateVO2maxFromActivities([ride(1)], { age: 35, gender: 'male', resting_hr: 60, max_hr: 185 }, { now: NOW });
    const withoutProfile = estimateVO2maxFromActivities([ride(1)], null, { now: NOW });
    expect(withoutProfile.vo2max).toBe(withProfile.vo2max);
  });

  it('applies the female gender adjustment (×0.88)', () => {
    const male = estimateVO2maxFromActivities([ride(1)], { gender: 'male', age: 30 }, { now: NOW });
    const female = estimateVO2maxFromActivities([ride(1)], { gender: 'female', age: 30 }, { now: NOW });
    expect(female.vo2max!).toBeLessThan(male.vo2max!);
  });

  it('clamps the result to [25, 80]', () => {
    const veryFast = [ride(1, { average_speed: 100 })];
    const result = estimateVO2maxFromActivities(veryFast, { age: 60 }, { now: NOW });
    expect(result.vo2max!).toBeLessThanOrEqual(80);

    const verySlow = [ride(1, { average_speed: 0, average_heartrate: undefined })];
    const slowResult = estimateVO2maxFromActivities(verySlow, null, { now: NOW });
    expect(slowResult.vo2max!).toBeGreaterThanOrEqual(25);
  });

  it('does not throw or NaN when no activity has heart-rate data', () => {
    const acts = [ride(1, { average_heartrate: undefined }), ride(2, { average_heartrate: undefined })];
    const result = estimateVO2maxFromActivities(acts, { age: 30 }, { now: NOW });
    expect(result.details?.avgHr).toBeNull();
    expect(Number.isNaN(result.vo2max)).toBe(false);
  });
});

describe('cooperTestVO2max', () => {
  it('matches the plain Cooper formula with no adjustments', () => {
    // No age/weight/gender supplied → pure 0.02241*d - 11.288.
    expect(cooperTestVO2max(3000)).toBe(Math.round(3000 * 0.02241 - 11.288));
  });

  it('applies the app/web gender factor (female ×0.9)', () => {
    const male = cooperTestVO2max(2800, { gender: 'male' });
    const female = cooperTestVO2max(2800, { gender: 'female' });
    expect(female).toBe(Math.round(male * 0.9));
  });

  it('applies the age adjustment for age > 40 and age < 25', () => {
    const base = 2800 * 0.02241 - 11.288;
    expect(cooperTestVO2max(2800, { age: 45 })).toBe(Math.round(base * (1 - 5 * 0.005)));
    expect(cooperTestVO2max(2800, { age: 20 })).toBe(Math.round(base * (1 + 5 * 0.003)));
    expect(cooperTestVO2max(2800, { age: 32 })).toBe(Math.round(base));
  });

  it('applies the weight adjustment for weight > 80 and weight < 60', () => {
    const base = 2800 * 0.02241 - 11.288;
    expect(cooperTestVO2max(2800, { weight: 90 })).toBe(Math.round(base * 0.98));
    expect(cooperTestVO2max(2800, { weight: 50 })).toBe(Math.round(base * 1.02));
  });

  it('matches VO2maxWidget/GarageCalculators/GoalAssistantPage for a known input', () => {
    // dist=3000, age=35, weight=75, gender=male — a common Cooper-test example.
    let expected = 3000 * 0.02241 - 11.288;
    // age 35 is between 25 and 40 -> no age adjustment.
    // gender male -> no adjustment.
    // weight 75 is between 60 and 80 -> no weight adjustment.
    expected = Math.round(expected);
    expect(cooperTestVO2max(3000, { age: 35, weight: 75, gender: 'male' })).toBe(expected);
  });
});

describe('vo2maxCategory', () => {
  it('matches the level boundaries used by VO2maxWidget/GarageCalculators', () => {
    expect(vo2maxCategory(29)).toBe('beginner');
    expect(vo2maxCategory(30)).toBe('belowAverage');
    expect(vo2maxCategory(39)).toBe('belowAverage');
    expect(vo2maxCategory(40)).toBe('average');
    expect(vo2maxCategory(49)).toBe('average');
    expect(vo2maxCategory(50)).toBe('aboveAverage');
    expect(vo2maxCategory(59)).toBe('aboveAverage');
    expect(vo2maxCategory(60)).toBe('excellent');
    expect(vo2maxCategory(69)).toBe('excellent');
    expect(vo2maxCategory(70)).toBe('elite');
    expect(vo2maxCategory(100)).toBe('elite');
  });
});
