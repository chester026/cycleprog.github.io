import { describe, expect, it } from 'vitest';
import { StravaActivitySchema } from './activity.js';

describe('StravaActivitySchema', () => {
  it('parses a realistic slim Strava activity (RAW_FIELDS shape)', () => {
    const activity = {
      id: 123456789,
      name: 'Morning ride',
      type: 'Ride',
      sport_type: 'Ride',
      workout_type: null,
      start_date: '2026-09-01T06:00:00Z',
      start_date_local: '2026-09-01T09:00:00Z',
      timezone: '(GMT+03:00) Europe/Nicosia',
      distance: 42000,
      moving_time: 5400,
      elapsed_time: 5600,
      total_elevation_gain: 350,
      average_speed: 7.8,
      max_speed: 15.2,
      average_heartrate: 142,
      max_heartrate: 178,
      has_heartrate: true,
      average_cadence: 82,
      average_watts: 180,
      max_watts: 620,
      weighted_average_watts: 195,
      device_watts: true,
      kilojoules: 972,
      gear_id: 'b1234',
      start_latlng: [35.17, 33.36],
      end_latlng: [35.18, 33.37],
      map: { id: 'a1234', summary_polyline: 'abc123' },
      gear: { id: 'b1234', name: 'Canyon Ultimate' },
      // extra field a future RAW_FIELDS bump / raw Strava payload might add
      kudos_count: 4,
    };
    const parsed = StravaActivitySchema.parse(activity);
    expect(parsed.id).toBe(123456789);
    expect(parsed.average_watts).toBe(180);
    expect((parsed as any).kudos_count).toBe(4);
  });

  it('rejects a non-numeric distance', () => {
    const result = StravaActivitySchema.safeParse({ id: 1, distance: 'far' });
    expect(result.success).toBe(false);
  });
});
