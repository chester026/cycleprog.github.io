import { describe, expect, it } from 'vitest';
import { weather } from './weather.js';

describe('weather contract', () => {
  it('wind query coerces numeric lat/lng and requires the date range', () => {
    const result = weather.wind.query!.safeParse({
      latitude: '59.33',
      longitude: '18.06',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.latitude).toBe(59.33);
  });

  it('wind query rejects an out-of-range latitude', () => {
    const result = weather.wind.query!.safeParse({
      latitude: '200',
      longitude: '18.06',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
    });
    expect(result.success).toBe(false);
  });

  it('wind response accepts a real Open-Meteo hourly payload', () => {
    const result = weather.wind.response.safeParse({
      hourly: { time: ['2026-09-01T00:00'], windspeed_10m: [3.2], winddirection_10m: [180] },
      hourly_units: { windspeed_10m: 'm/s' },
    });
    expect(result.success).toBe(true);
  });

  it('forecast response accepts a real Open-Meteo daily payload', () => {
    const result = weather.forecast.response.safeParse({
      daily: { time: ['2026-09-01'], temperature_2m_max: [22.1], weather_code: [3] },
      timezone: 'Europe/Stockholm',
    });
    expect(result.success).toBe(true);
  });
});
