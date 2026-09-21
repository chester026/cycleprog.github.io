import { describe, expect, it } from 'vitest';
import { activities } from './activities.js';

describe('activities contract', () => {
  it('list accepts a real Strava activity array', () => {
    const result = activities.list.response.safeParse([
      {
        id: 12345678901,
        name: 'Morning ride',
        type: 'Ride',
        start_date: '2026-09-01T06:00:00Z',
        distance: 42000,
        moving_time: 5400,
        elapsed_time: 5600,
        total_elevation_gain: 320,
        average_speed: 7.8,
        max_speed: 15.2,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('detail accepts a single activity, extra Strava fields included', () => {
    const result = activities.detail.response.safeParse({
      id: 1,
      name: 'Evening spin',
      type: 'Ride',
      start_date: '2026-09-01T18:00:00Z',
      distance: 10000,
      moving_time: 1800,
      elapsed_time: 1900,
      total_elevation_gain: 50,
      average_speed: 5.5,
      max_speed: 9.1,
      // Strava's DetailedActivity carries more than SummaryActivity — the
      // schema is `.passthrough()`, so extras must not be rejected.
      splits_metric: [{ distance: 1000, elapsed_time: 180 }],
    });
    expect(result.success).toBe(true);
  });

  it('detail params coerces the numeric id', () => {
    const parsed = activities.detail.params!.parse({ id: '987654321' });
    expect(parsed.id).toBe(987654321);
  });

  it('streams accepts Strava\'s per-type stream object', () => {
    const result = activities.streams.response.safeParse({
      heartrate: { data: [120, 130, 140], series_type: 'time', original_size: 3, resolution: 'high' },
      watts: { data: [180, 190, 200] },
      time: { data: [0, 1, 2] },
    });
    expect(result.success).toBe(true);
  });

  it('ftpAnalysis accepts a cached/fresh result', () => {
    const result = activities.ftpAnalysis.response.safeParse({
      totalMinutes: 12,
      totalIntervals: 3,
      intervals: [{ startSec: 100, durationSec: 130, avgHr: 165 }],
      fromCache: true,
    });
    expect(result.success).toBe(true);
  });

  it('metaGoalsProgress accepts the per-goal progress array', () => {
    const result = activities.metaGoalsProgress.response.safeParse([
      {
        id: 7,
        title: 'Ride 1000km this year',
        status: 'active',
        tier: 'epic',
        progress: 42,
        progressGain: 3,
        contributions: [{ type: 'distance', label: 'Distance', value: '+42.0 km' }],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('analyzeSummary (POST /api/ai-analysis) accepts an arbitrary summary body', () => {
    const result = activities.analyzeSummary.body!.safeParse({
      summary: { name: 'Ride', distance_km: '42.00', average_heartrate: 150 },
    });
    expect(result.success).toBe(true);
  });

  it('cacheClear response', () => {
    const result = activities.cacheClear.response.safeParse({ success: true, message: 'Activities cache cleared.' });
    expect(result.success).toBe(true);
  });
});
