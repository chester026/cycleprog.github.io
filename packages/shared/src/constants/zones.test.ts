import { describe, expect, it } from 'vitest';
import {
  HR_ZONE_COLORS,
  KARVONEN_ZONE_COEFFICIENTS,
  LTHR_ZONE_COEFFICIENTS,
  PERCENT_MAX_HR_ZONE_COEFFICIENTS,
} from './zones.js';

describe('zone coefficient tables', () => {
  it('LTHR coefficients match HeartRateZonesChart.jsx', () => {
    expect(LTHR_ZONE_COEFFICIENTS).toEqual([0.75, 0.85, 0.92, 0.97, 1.03]);
  });

  it('Karvonen and %maxHR coefficients match', () => {
    expect(KARVONEN_ZONE_COEFFICIENTS).toEqual([0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(PERCENT_MAX_HR_ZONE_COEFFICIENTS).toEqual([0.5, 0.6, 0.7, 0.8, 0.9]);
  });
});

describe('HR_ZONE_COLORS', () => {
  it('has all 5 zones with the colors shared by HeartAnalysis.tsx and HeartRateZonesChart.jsx', () => {
    expect(HR_ZONE_COLORS).toEqual({
      zone1: '#22c55e',
      zone2: '#84cc16',
      zone3: '#eab308',
      zone4: '#f97316',
      zone5: '#ef4444',
    });
  });
});
