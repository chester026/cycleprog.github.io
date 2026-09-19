import { describe, expect, it } from 'vitest';
import { analytics } from './analytics.js';

const PLAN = {
  rides: 12,
  km: 400,
  long: 4,
  intervals: 8,
  description: 'Intermediate plan',
  experienceLevel: 'intermediate',
  timeAvailable: 5,
  timeModifier: 1.0,
  weeklyStructure: { rides: 3, volume: 100, longRides: 1, intervals: 2 },
};

describe('analytics contract', () => {
  it('summary accepts a real aggregate payload', () => {
    const result = analytics.summary.response.safeParse({
      summary: {
        totalCalories: 4200,
        totalTimeH: 8.5,
        totalCarbs: 500,
        totalWater: 5.1,
        totalRides: 4,
        longestRide: { distKm: 62, timeH: 2.5, cal: 1200, carbs: 150, water: 1.5, gels: 4, bars: 3, name: 'Long ride', date: '2026-09-01T06:00:00.000Z' },
        avgPerWeek: 1,
        longRidesCount: 1,
        intervalsCount: 0,
        highIntensityTimeMin: 20,
        highIntensityIntervals: 2,
        highIntensitySessions: 2,
        progress: { rides: 33, km: 40, long: 25, intervals: 0 },
        plan: PLAN,
        zones: { z2: 30, z3: 50, z4: 10, other: 5 },
        totalKm: 160,
        totalElev: 1200,
        totalMovingHours: 8,
        avgSpeed: 20,
        vo2max: 45.2,
        ftp: null,
        power: { avg: 180, best: 220, worst: 140, trend: 'up', totalActivities: 4, activitiesWithRealPower: 1, activitiesWithWindData: 3 },
      },
      // period.start/end are `new Date(...)` in services/analytics.js —
      // still Date instances at response-validation time.
      period: { start: new Date('2026-08-01'), end: new Date('2026-08-31') },
    });
    expect(result.success).toBe(true);
  });

  it('summary accepts the empty-activities shape ({summary: null}, no period)', () => {
    const result = analytics.summary.response.safeParse({ summary: null });
    expect(result.success).toBe(true);
  });

  it('hrZones query accepts the four documented periods only', () => {
    expect(analytics.hrZones.query!.safeParse({ period: '3m' }).success).toBe(true);
    expect(analytics.hrZones.query!.safeParse({ period: 'never' }).success).toBe(false);
  });

  it('hrZones response accepts a real zones distribution', () => {
    const result = analytics.hrZones.response.safeParse({
      zones: [{ id: 1, name: 'Recovery', color: '#00ff00', min: 80, max: 120, seconds: 600, percent: 20 }],
      coverage: { total: 5, withStreams: 4, fallback: 1, pending: 0 },
      period: '4w',
    });
    expect(result.success).toBe(true);
  });

  it('snapshotLatest accepts null (no snapshot saved yet)', () => {
    expect(analytics.snapshotLatest.response.safeParse(null).success).toBe(true);
  });

  it('snapshotLatest accepts a real analytics_snapshots row', () => {
    const result = analytics.snapshotLatest.response.safeParse({
      id: 1,
      user_id: 42,
      snapshot_date: '2026-09-01',
      last_activity_id: 123,
      avg_power: 180,
      max_power: 400,
      min_power: 0,
      avg_hr: 140,
      max_hr: 180,
      min_hr: 60,
      avg_speed: 25,
      max_speed: 45,
      min_speed: 0,
      avg_cadence: 85,
      max_cadence: 110,
      min_cadence: 0,
      vo2max: 45.2,
      activities_count: 10,
      created_at: new Date('2026-09-01T00:00:00Z'),
    });
    expect(result.success).toBe(true);
  });
});
