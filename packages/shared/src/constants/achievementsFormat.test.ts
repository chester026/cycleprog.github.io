import { describe, expect, it } from 'vitest';
import { formatBadgeValue } from './achievementsFormat.js';

describe('formatBadgeValue', () => {
  it('formats hr_intensity as a percent-of-max-HR', () => {
    expect(formatBadgeValue(0.85, 'hr_intensity')).toEqual({ value: '85', unit: 'max HR' });
  });

  it('formats hr_intensity_rides / weekly_streak as bare counts', () => {
    expect(formatBadgeValue(5, 'hr_intensity_rides')).toEqual({ value: '5', unit: 'rides' });
    expect(formatBadgeValue(3, 'weekly_streak')).toEqual({ value: '3', unit: 'weeks' });
  });

  it('formats distance/elevation with a "k" suffix at >= 1000', () => {
    expect(formatBadgeValue(500, 'distance')).toEqual({ value: '500', unit: 'km' });
    expect(formatBadgeValue(1000, 'total_distance')).toEqual({ value: '1k', unit: 'km' });
    expect(formatBadgeValue(2500, 'total_elevation_gain')).toEqual({ value: '3k', unit: 'meters' });
    expect(formatBadgeValue(500, 'elevation_gain')).toEqual({ value: '500', unit: 'meters' });
  });

  it('formats speed/power/cadence metrics', () => {
    expect(formatBadgeValue(45, 'average_speed')).toEqual({ value: '45', unit: 'km/h' });
    expect(formatBadgeValue(80, 'max_speed')).toEqual({ value: '80', unit: 'km/h' });
    expect(formatBadgeValue(60, 'focus_max_speed')).toEqual({ value: '60', unit: 'km/h' });
    expect(formatBadgeValue(250, 'average_watts')).toEqual({ value: '250', unit: 'watts' });
    expect(formatBadgeValue(90, 'average_cadence')).toEqual({ value: '90', unit: 'rpm' });
  });

  it('falls back to a unitless value for an unknown metric', () => {
    expect(formatBadgeValue(7, 'mystery_metric')).toEqual({ value: '7', unit: '' });
  });

  it('coerces a non-numeric threshold to 0', () => {
    expect(formatBadgeValue(Number('nope'), 'distance')).toEqual({ value: '0', unit: 'km' });
  });
});
