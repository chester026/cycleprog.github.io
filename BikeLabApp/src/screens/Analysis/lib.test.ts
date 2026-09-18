import {
  getGoalOrFallback,
  percentForPeriod,
  calculate4WeekPeriods,
  computeHeroSummary,
  computePlanInfo,
  calculateUserHRZones,
} from './lib';
import type {Activity} from '../../types/activity';

const baseActivity = (overrides: Partial<Activity>): Activity =>
  ({
    id: 1,
    name: 'Ride',
    distance: 30000,
    moving_time: 3600,
    elapsed_time: 3600,
    total_elevation_gain: 50,
    average_speed: 8, // 28.8 km/h
    max_speed: 12,
    start_date: '2024-01-08T08:00:00Z', // ISO week 2, 2024
    type: 'Ride',
    ...overrides,
  } as unknown as Activity);

describe('getGoalOrFallback', () => {
  it('returns the beginner speed_flat goal', () => {
    expect(getGoalOrFallback('speed_flat', 'beginner')).toBe(25);
  });

  it('returns the advanced easy_elevation goal', () => {
    expect(getGoalOrFallback('easy_elevation', 'advanced')).toBe(400);
  });

  it('falls back to the intermediate default for an unknown level', () => {
    expect(getGoalOrFallback('speed_hills', 'unknown')).toBe(17.5);
  });
});

describe('calculate4WeekPeriods', () => {
  it('returns an empty array for no activities', () => {
    expect(calculate4WeekPeriods([])).toEqual([]);
  });

  it('groups activities into a single 4-week cycle', () => {
    const activities = [
      baseActivity({start_date: '2024-01-08T08:00:00Z'}),
      baseActivity({start_date: '2024-01-15T08:00:00Z'}),
    ];
    const periods = calculate4WeekPeriods(activities);
    expect(periods).toHaveLength(1);
    expect(periods[0].activities).toHaveLength(2);
  });

  it('splits activities more than 4 weeks apart into separate cycles', () => {
    const activities = [
      baseActivity({start_date: '2024-01-08T08:00:00Z'}),
      baseActivity({start_date: '2024-03-01T08:00:00Z'}),
    ];
    const periods = calculate4WeekPeriods(activities);
    expect(periods.length).toBeGreaterThan(1);
  });
});

describe('percentForPeriod', () => {
  it('computes a progress breakdown for a mixed set of rides', () => {
    const flat = baseActivity({
      distance: 25000,
      total_elevation_gain: 20,
      average_speed: 8, // 28.8 km/h
      average_heartrate: 140,
    });
    const longRide = baseActivity({distance: 60000, moving_time: 3 * 3600});
    const result = percentForPeriod(
      [flat, longRide],
      new Date('2024-01-01'),
      new Date('2024-01-28'),
      {experience_level: 'intermediate'} as any,
    );
    expect(result.all).toHaveLength(5);
    expect(typeof result.avg).toBe('number');
    expect(result.start).toEqual(new Date('2024-01-01'));
  });

  it('does not divide by zero when a bucket is empty', () => {
    const result = percentForPeriod([], new Date(), new Date(), null);
    expect(Number.isNaN(result.avg)).toBe(false);
  });
});

describe('calculateUserHRZones', () => {
  it('prefers the server-derived hr_zones on the profile', () => {
    const zones = [{id: 1, key: 'z1', nameKey: 'z1', name: 'Z1', min: 0, max: 100, color: '#000'}];
    const result = calculateUserHRZones({hr_zones: {zones, method: 'maxhr', basis: {max_hr: 190}}} as any);
    expect(result.zones).toBe(zones);
  });

  it('falls back to computeHrZones when the profile has none', () => {
    const result = calculateUserHRZones(null);
    expect(result.zones).toHaveLength(5);
  });
});

describe('computeHeroSummary', () => {
  it('returns null for an empty activity list', () => {
    expect(computeHeroSummary([], null)).toBeNull();
  });

  it('sums distance/time/elevation and caps progress at 100%', () => {
    const activities = [
      baseActivity({distance: 100000, moving_time: 4 * 3600, total_elevation_gain: 100}),
    ];
    const summary = computeHeroSummary(activities, {workouts_per_week: 1, weekly_goal_km: 10} as any);
    expect(summary?.totalRides).toBe(1);
    expect(summary?.totalKm).toBe(100);
    expect(summary?.progress.km).toBe(100); // capped, not 250%
  });
});

describe('computePlanInfo', () => {
  const t = {balancedPlan: 'Balanced plan', hWeek: 'h/week - ', ridesWeek: ' rides/week'};

  it('returns null without a profile', () => {
    expect(computePlanInfo(null, t)).toBeNull();
  });

  it('falls back to defaults for missing fields', () => {
    const info = computePlanInfo({} as any, t);
    expect(info?.description).toBe('Balanced plan');
    expect(info?.details).toBe('5h/week - 3 rides/week');
  });

  it('prefers profile-provided plan_description/time_available/workouts_per_week', () => {
    const info = computePlanInfo(
      {plan_description: 'Custom plan', time_available: 8, workouts_per_week: 4} as any,
      t,
    );
    expect(info?.description).toBe('Custom plan');
    expect(info?.details).toBe('8h/week - 4 rides/week');
  });
});
