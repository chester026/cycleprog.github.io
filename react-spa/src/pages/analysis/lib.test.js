import { describe, it, expect } from 'vitest';
import { median, isEmptyPeriod, calculatePeriods, computePlanFactHero } from './lib';

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('isEmptyPeriod', () => {
  it('is empty when there is no summary at all', () => {
    expect(isEmptyPeriod(null)).toBe(true);
  });

  it('is empty when rides/km/long rides are all zero', () => {
    expect(isEmptyPeriod({ totalRides: 0, totalKm: 0, longRidesCount: 0 })).toBe(true);
  });

  it('is not empty when any figure is positive', () => {
    expect(isEmptyPeriod({ totalRides: 2, totalKm: 0, longRidesCount: 0 })).toBe(false);
  });
});

describe('calculatePeriods', () => {
  it('returns no periods for no activities', () => {
    expect(calculatePeriods([])).toEqual([]);
  });

  it('groups activities into consecutive 4-week cycles within a year', () => {
    const periods = calculatePeriods([
      { start_date: '2024-01-10T00:00:00Z', distance: 10000 },
      { start_date: '2024-03-10T00:00:00Z', distance: 20000 },
    ]);
    expect(periods.length).toBeGreaterThanOrEqual(1);
    // Oldest activity's cycle should come first once sorted ascending.
    expect(new Date(periods[0].activities[0].start_date).getTime())
      .toBeLessThanOrEqual(new Date(periods[periods.length - 1].activities[0].start_date).getTime());
  });
});

describe('computePlanFactHero', () => {
  it('falls back to zero fact/pct values when there are no activities', () => {
    const result = computePlanFactHero([], { rides: 12, km: 400, long: 4, intervals: 4 }, { count: 0, min: 0, label: 'Low', color: '#bdbdbd' });
    expect(result.data[0]).toMatchObject({ label: 'Workouts', fact: 0, plan: 12, pct: 0 });
    expect(result.minDate).toBeNull();
    expect(result.maxDate).toBeNull();
  });
});
