import { describe, expect, it } from 'vitest';
import { formatDistanceKm, formatDuration, kmhToMs, metersToKm, msToKmh, secondsToHours } from './units.js';

describe('msToKmh', () => {
  it('converts m/s to km/h', () => {
    expect(msToKmh(1)).toBeCloseTo(3.6);
    expect(msToKmh(0)).toBe(0);
    expect(msToKmh(10)).toBeCloseTo(36);
  });
});

describe('kmhToMs', () => {
  it('converts km/h to m/s', () => {
    expect(kmhToMs(3.6)).toBeCloseTo(1);
    expect(kmhToMs(0)).toBe(0);
    expect(kmhToMs(36)).toBeCloseTo(10);
  });

  it('round-trips with msToKmh', () => {
    expect(kmhToMs(msToKmh(7.2))).toBeCloseTo(7.2);
  });
});

describe('metersToKm', () => {
  it('converts meters to kilometers', () => {
    expect(metersToKm(1000)).toBe(1);
    expect(metersToKm(0)).toBe(0);
    expect(metersToKm(12345)).toBeCloseTo(12.345);
  });
});

describe('secondsToHours', () => {
  it('converts seconds to hours', () => {
    expect(secondsToHours(3600)).toBe(1);
    expect(secondsToHours(0)).toBe(0);
    expect(secondsToHours(1800)).toBe(0.5);
  });
});

describe('formatDistanceKm', () => {
  it('formats meters as a km string with the default 1 decimal', () => {
    expect(formatDistanceKm(12345)).toBe('12.3');
  });

  it('honors a custom digits count', () => {
    expect(formatDistanceKm(12345, 0)).toBe('12');
    expect(formatDistanceKm(12345, 2)).toBe('12.35');
  });

  it('formats 0 meters', () => {
    expect(formatDistanceKm(0)).toBe('0.0');
  });
});

describe('formatDuration', () => {
  it('formats sub-hour durations as "Xm"', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59)).toBe('0m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(45 * 60)).toBe('45m');
  });

  it('formats hour-plus durations as "Xh Ym"', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3600 + 23 * 60)).toBe('1h 23m');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2h 5m');
  });
});
