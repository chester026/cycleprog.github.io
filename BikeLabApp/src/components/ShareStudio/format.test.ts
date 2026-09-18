// Avoids pulling in the real i18next/react-native-localize/AsyncStorage
// chain (`../../i18n/dateLocale` -> `./i18n`) just to test date formatting.
jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

import {
  formatDistanceKm,
  formatDistanceKmComma,
  formatSpeedKmh,
  formatElevationM,
  formatDuration,
  formatDurationWithSeconds,
  formatDurationPadded,
  formatDateShort,
  formatDateLong,
  sampleChartData,
} from './format';

describe('formatDistanceKm', () => {
  it('converts meters to a 1-decimal km string', () => {
    expect(formatDistanceKm(12345)).toBe('12.3');
  });

  it('respects a custom digit count', () => {
    expect(formatDistanceKm(12345, 2)).toBe('12.35');
  });
});

describe('formatDistanceKmComma', () => {
  it('uses a comma decimal separator (Template F)', () => {
    expect(formatDistanceKmComma(12340)).toBe('12,34');
  });
});

describe('formatSpeedKmh', () => {
  it('converts m/s to a 1-decimal km/h string', () => {
    expect(formatSpeedKmh(7.6157)).toBe('27.4');
  });
});

describe('formatElevationM', () => {
  it('rounds to the nearest whole meter', () => {
    expect(formatElevationM(452.6)).toBe(453);
    expect(formatElevationM(452.4)).toBe(452);
  });
});

describe('formatDuration (shared @bikelab/shared/calc variant)', () => {
  it('formats sub-hour durations as minutes', () => {
    expect(formatDuration(45 * 60)).toBe('45m');
  });

  it('formats durations over an hour as "Xh Ym"', () => {
    expect(formatDuration(3600 + 23 * 60)).toBe('1h 23m');
  });
});

describe('formatDurationWithSeconds (Template A)', () => {
  it('includes seconds under an hour', () => {
    expect(formatDurationWithSeconds(45 * 60 + 12)).toBe('45m 12s');
  });

  it('drops seconds once there is an hours component', () => {
    expect(formatDurationWithSeconds(3600 + 23 * 60 + 59)).toBe('1h 23m');
  });
});

describe('formatDurationPadded (Template B)', () => {
  it('zero-pads minutes when there is an hours component', () => {
    expect(formatDurationPadded(3600 + 5 * 60)).toBe('1h05');
  });

  it('has no padding under an hour', () => {
    expect(formatDurationPadded(45 * 60)).toBe('45m');
  });
});

describe('formatDateShort (Template C)', () => {
  it('formats as MM.DD.YYYY', () => {
    expect(formatDateShort('2025-03-04T10:00:00Z')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});

describe('formatDateLong (Template A)', () => {
  it('formats a long, locale-aware date', () => {
    expect(formatDateLong('2025-03-04T10:00:00Z')).toContain('2025');
  });
});

describe('sampleChartData', () => {
  it('returns an empty array for empty/undefined input', () => {
    expect(sampleChartData(undefined)).toEqual([]);
    expect(sampleChartData([])).toEqual([]);
  });

  it('downsamples to at most maxPoints values, preserving order', () => {
    const input = Array.from({length: 600}, (_, i) => i);
    const result = sampleChartData(input, 60);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result[0]).toEqual({value: 0});
    expect(result.every((point, i) => i === 0 || point.value > result[i - 1].value)).toBe(true);
  });

  it('leaves short arrays untouched', () => {
    expect(sampleChartData([1, 2, 3], 60)).toEqual([{value: 1}, {value: 2}, {value: 3}]);
  });
});
