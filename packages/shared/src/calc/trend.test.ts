import { describe, expect, it } from 'vitest';
import { computeMetricTrend } from './trend.js';

describe('computeMetricTrend', () => {
  it('returns all-null when history has fewer than 2 entries', () => {
    expect(computeMetricTrend([])).toEqual({ avg_power: null, avg_hr: null, avg_cadence: null });
    expect(computeMetricTrend([{ avg_power: 100 }])).toEqual({
      avg_power: null,
      avg_hr: null,
      avg_cadence: null,
    });
  });

  it('returns all-null for null/undefined input', () => {
    expect(computeMetricTrend(null)).toEqual({ avg_power: null, avg_hr: null, avg_cadence: null });
    expect(computeMetricTrend(undefined)).toEqual({
      avg_power: null,
      avg_hr: null,
      avg_cadence: null,
    });
  });

  it('diffs the newest snapshot against the previous one', () => {
    const history = [
      { avg_power: 210, avg_hr: 150, avg_cadence: 85 },
      { avg_power: 200, avg_hr: 145, avg_cadence: 88 },
    ];
    expect(computeMetricTrend(history)).toEqual({ avg_power: 10, avg_hr: 5, avg_cadence: -3 });
  });

  it('coerces Postgres NUMERIC strings to numbers', () => {
    const history = [
      { avg_power: '210', avg_hr: '150.5', avg_cadence: '85' },
      { avg_power: '200', avg_hr: '145.5', avg_cadence: '88' },
    ];
    expect(computeMetricTrend(history)).toEqual({ avg_power: 10, avg_hr: 5, avg_cadence: -3 });
  });

  it('treats a null/undefined/non-finite field as missing for that field only', () => {
    const history = [
      { avg_power: null, avg_hr: 150, avg_cadence: 'n/a' },
      { avg_power: 200, avg_hr: 145, avg_cadence: 88 },
    ];
    expect(computeMetricTrend(history)).toEqual({ avg_power: null, avg_hr: 5, avg_cadence: null });
  });

  it('ignores any entries beyond the first two', () => {
    const history = [
      { avg_power: 210, avg_hr: 150, avg_cadence: 85 },
      { avg_power: 200, avg_hr: 145, avg_cadence: 88 },
      { avg_power: 0, avg_hr: 0, avg_cadence: 0 },
    ];
    expect(computeMetricTrend(history)).toEqual({ avg_power: 10, avg_hr: 5, avg_cadence: -3 });
  });
});
