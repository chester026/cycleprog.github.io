import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  getYears,
  filterByYear,
  getTypesForActivities,
  applyActivityFilters,
  groupByYear,
  buildRows,
  analyzeActivity,
  buildActivityCopyPayload,
  buildAiSummary,
} from './lib';

const ride = (overrides = {}) => ({
  id: 1,
  name: 'Morning ride',
  type: 'Ride',
  start_date: '2024-05-01T08:00:00Z',
  distance: 40000,
  moving_time: 5400,
  elapsed_time: 5600,
  average_speed: 8,
  max_speed: 12,
  total_elevation_gain: 300,
  average_heartrate: 140,
  max_heartrate: 170,
  average_cadence: 85,
  ...overrides,
});

describe('getYears', () => {
  it('returns distinct years, descending', () => {
    const years = getYears([
      ride({ start_date: '2022-01-01' }),
      ride({ start_date: '2024-01-01' }),
      ride({ start_date: '2023-01-01' }),
      ride({ start_date: null }),
    ]);
    expect(years).toEqual([2024, 2023, 2022]);
  });
});

describe('filterByYear', () => {
  it('passes everything through for "all"', () => {
    const acts = [ride({ start_date: '2024-01-01' }), ride({ start_date: '2023-01-01' })];
    expect(filterByYear(acts, 'all')).toHaveLength(2);
  });

  it('keeps only the matching year (string or number)', () => {
    const acts = [ride({ id: 1, start_date: '2024-01-01' }), ride({ id: 2, start_date: '2023-01-01' })];
    expect(filterByYear(acts, '2024').map((a) => a.id)).toEqual([1]);
    expect(filterByYear(acts, 2023).map((a) => a.id)).toEqual([2]);
  });
});

describe('getTypesForActivities', () => {
  it('only reports ride types, ignoring non-ride activities', () => {
    const types = getTypesForActivities([
      ride({ type: 'Ride' }),
      ride({ type: 'VirtualRide' }),
      ride({ type: 'Run' }),
    ]);
    expect(types.sort()).toEqual(['Ride', 'VirtualRide']);
  });
});

describe('applyActivityFilters', () => {
  it('drops non-ride activities regardless of other filters', () => {
    const acts = [ride({ id: 1, type: 'Run' }), ride({ id: 2, type: 'Ride' })];
    const result = applyActivityFilters(acts, DEFAULT_FILTERS);
    expect(result.map((a) => a.id)).toEqual([2]);
  });

  it('filters by name (case-insensitive substring)', () => {
    const acts = [ride({ id: 1, name: 'Hill climb' }), ride({ id: 2, name: 'Flat loop' })];
    const result = applyActivityFilters(acts, { ...DEFAULT_FILTERS, name: 'hill' });
    expect(result.map((a) => a.id)).toEqual([1]);
  });

  it('filters by distance range (km)', () => {
    const acts = [
      ride({ id: 1, distance: 20000 }),
      ride({ id: 2, distance: 50000 }),
      ride({ id: 3, distance: 80000 }),
    ];
    const result = applyActivityFilters(acts, { ...DEFAULT_FILTERS, distMin: '30', distMax: '60' });
    expect(result.map((a) => a.id)).toEqual([2]);
  });

  it('filters by average speed and heartrate ranges', () => {
    const acts = [
      ride({ id: 1, average_speed: 5, average_heartrate: 130 }), // 18 km/h
      ride({ id: 2, average_speed: 8, average_heartrate: 150 }), // 28.8 km/h
    ];
    const result = applyActivityFilters(acts, { ...DEFAULT_FILTERS, speedMin: '25', hrMax: '160' });
    expect(result.map((a) => a.id)).toEqual([2]);
  });

  it('excludes activities missing the filtered field', () => {
    const acts = [ride({ id: 1, average_heartrate: null })];
    const result = applyActivityFilters(acts, { ...DEFAULT_FILTERS, hrMin: '100' });
    expect(result).toHaveLength(0);
  });
});

describe('groupByYear / buildRows', () => {
  it('groups by year, newest first, and flattens with year headers', () => {
    const acts = [
      ride({ id: 1, start_date: '2023-06-01' }),
      ride({ id: 2, start_date: '2024-06-01' }),
      ride({ id: 3, start_date: '2024-01-01' }),
    ];
    const groups = groupByYear(acts);
    expect(groups.map((g) => g.year)).toEqual(['2024', '2023']);
    expect(groups[0].activities).toHaveLength(2);

    const rows = buildRows(groups);
    expect(rows[0]).toMatchObject({ kind: 'year', year: '2024', count: 2 });
    expect(rows.filter((r) => r.kind === 'activity')).toHaveLength(3);
  });
});

describe('analyzeActivity', () => {
  it('flags slow average speed', () => {
    const { recommendations } = analyzeActivity(ride({ average_speed: 5 })); // 18 km/h
    expect(recommendations.some((r) => r.title.includes('Average speed'))).toBe(true);
  });

  it('classifies a long ride', () => {
    const { type } = analyzeActivity(ride({ distance: 100000 }));
    expect(type).toBe('Long');
  });

  it('falls back to a positive message when nothing is flagged', () => {
    const { recommendations } = analyzeActivity(
      ride({ average_speed: 9, average_heartrate: 140, distance: 40000, average_cadence: 90, total_elevation_gain: 200 })
    );
    expect(recommendations).toEqual([
      expect.objectContaining({ title: 'Great training!' }),
    ]);
  });
});

describe('buildActivityCopyPayload', () => {
  it('converts distance/time/speed to display units', () => {
    const payload = buildActivityCopyPayload(ride({ distance: 42000, moving_time: 3600, average_speed: 10 }));
    expect(payload.distance).toBe('42.00');
    expect(payload.moving_time).toBe('60.0');
    expect(payload.average_speed).toBe('36.00');
    expect(payload.name).toBe('Morning ride');
  });

  it('uses "-" for missing fields', () => {
    const payload = buildActivityCopyPayload(ride({ average_cadence: null }));
    expect(payload.average_cadence).toBe('-');
  });
});

describe('buildAiSummary', () => {
  it('rounds and converts fields for the AI endpoint', () => {
    const summary = buildAiSummary(ride({ distance: 42195, average_speed: 8.33 }));
    expect(summary.distance_km).toBeCloseTo(42.2, 1);
    expect(summary.average_speed_kmh).toBeCloseTo(29.99, 1);
    expect(summary.name).toBe('Morning ride');
  });
});
