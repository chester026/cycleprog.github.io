import { describe, it, expect } from 'vitest';
import { isRideActivity, filterRides, formatShortDate, movingAverage, useRideSeries } from './series';

const ride = (overrides = {}) => ({
  type: 'Ride',
  start_date: '2024-01-01T10:00:00Z',
  average_heartrate: 140,
  max_heartrate: 160,
  average_speed: 8, // m/s
  average_cadence: 85,
  total_elevation_gain: 100,
  ...overrides,
});

describe('isRideActivity / filterRides', () => {
  it('matches Ride/VirtualRide by type or sport_type', () => {
    expect(isRideActivity({ type: 'Ride' })).toBe(true);
    expect(isRideActivity({ type: 'VirtualRide' })).toBe(true);
    expect(isRideActivity({ sport_type: 'Ride' })).toBe(true);
    expect(isRideActivity({ type: 'Run' })).toBe(false);
    expect(isRideActivity(null)).toBe(false);
  });

  it('filters a mixed activities array down to rides, keeping an extra predicate ANDed in', () => {
    const activities = [ride(), { type: 'Run' }, ride({ average_heartrate: null })];
    expect(filterRides(activities)).toHaveLength(2);
    expect(filterRides(activities, (a) => a.average_heartrate != null)).toHaveLength(1);
    expect(filterRides(null)).toEqual([]);
  });
});

describe('formatShortDate', () => {
  it('formats as day.month (ru-RU)', () => {
    expect(formatShortDate('2024-03-05T00:00:00Z')).toBe('05.03');
  });
  it('returns empty string for falsy/invalid input', () => {
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('not-a-date')).toBe('');
  });
});

describe('movingAverage', () => {
  it('returns the input unchanged for window <= 1', () => {
    expect(movingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
    expect(movingAverage([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('averages the trailing window, skipping nulls', () => {
    expect(movingAverage([10, 20, 30], 2)).toEqual([10, 15, 25]);
    expect(movingAverage([10, null, 30], 2)).toEqual([10, 10, 30]);
  });
});

describe('useRideSeries', () => {
  it('returns [] with no activities or no metric', () => {
    expect(useRideSeries([], { metric: 'average_heartrate' })).toEqual([]);
    expect(useRideSeries([ride()], {})).toEqual([]);
  });

  it('"recent" mode: sorts oldest-first, limits, converts m/s to km/h, drops incomplete points', () => {
    const activities = [
      ride({ start_date: '2024-01-03', average_heartrate: 150, average_speed: 10 }),
      ride({ start_date: '2024-01-01', average_heartrate: 140, average_speed: 8 }),
      ride({ start_date: '2024-01-02', average_heartrate: null, average_speed: 9 }), // dropped: no HR
    ];
    const points = useRideSeries(activities, {
      metric: 'average_heartrate',
      metric2: 'average_speed',
      metric2ToKmh: true,
      mode: 'recent',
    });
    expect(points).toEqual([
      { x: '01.01', y: 140, y2: 28.8 },
      { x: '03.01', y: 150, y2: 36 },
    ]);
  });

  it('"recent" mode: limit keeps only the most recent N before reversing', () => {
    const activities = [
      ride({ start_date: '2024-01-01', average_heartrate: 100 }),
      ride({ start_date: '2024-01-02', average_heartrate: 101 }),
      ride({ start_date: '2024-01-03', average_heartrate: 102 }),
    ];
    const points = useRideSeries(activities, { metric: 'average_heartrate', mode: 'recent', limit: 2 });
    expect(points.map((p) => p.y)).toEqual([101, 102]);
  });

  it('"scatter" mode: newest-first, filters non-positive x / missing y', () => {
    const activities = [
      ride({ start_date: '2024-01-01', total_elevation_gain: 100, average_heartrate: 140 }),
      ride({ start_date: '2024-01-02', total_elevation_gain: 0, average_heartrate: 150 }), // dropped: elev 0
      ride({ start_date: '2024-01-03', total_elevation_gain: 200, average_heartrate: null }), // dropped: no HR
    ];
    const points = useRideSeries(activities, {
      metric: 'average_heartrate',
      xMetric: 'total_elevation_gain',
      mode: 'scatter',
    });
    expect(points).toEqual([{ x: 100, y: 140, date: '01.01' }]);
  });

  it('"weekly-avg" mode: groups by ISO week and averages, sorted chronologically', () => {
    const activities = [
      ride({ start_date: '2024-01-08', average_heartrate: 160 }), // ISO week 2
      ride({ start_date: '2024-01-01', average_heartrate: 140 }), // ISO week 1
      ride({ start_date: '2024-01-02', average_heartrate: 150 }), // ISO week 1
    ];
    const points = useRideSeries(activities, { metric: 'average_heartrate', mode: 'weekly-avg' });
    expect(points).toEqual([
      { x: '2024-W1', y: 145 },
      { x: '2024-W2', y: 160 },
    ]);
  });

  it('"weekly-max" mode: groups by ISO week and takes the max', () => {
    const activities = [
      ride({ start_date: '2024-01-01', max_heartrate: 160 }),
      ride({ start_date: '2024-01-02', max_heartrate: 175 }),
    ];
    const points = useRideSeries(activities, { metric: 'max_heartrate', mode: 'weekly-max' });
    expect(points).toEqual([{ x: '2024-W1', y: 175 }]);
  });

  it('adds a yMa moving-average field when movingAverageWindow is set', () => {
    const activities = [
      ride({ start_date: '2024-01-01', average_heartrate: 100 }),
      ride({ start_date: '2024-01-02', average_heartrate: 200 }),
    ];
    const points = useRideSeries(activities, {
      metric: 'average_heartrate',
      mode: 'recent',
      movingAverageWindow: 2,
    });
    expect(points.map((p) => p.yMa)).toEqual([100, 150]);
  });
});
