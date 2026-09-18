import { describe, expect, it } from 'vitest';
import { AnalyticsSnapshotSchema, AnalyticsSnapshotCreateSchema } from './snapshot.js';

describe('AnalyticsSnapshotSchema', () => {
  it('parses a realistic GET /api/analytics-snapshot/latest row', () => {
    const parsed = AnalyticsSnapshotSchema.parse({
      id: 1,
      user_id: 42,
      snapshot_date: '2026-09-01',
      last_activity_id: 123456,
      avg_power: 180.5,
      max_power: 620,
      min_power: 0,
      avg_hr: 142,
      max_hr: 178,
      min_hr: 60,
      avg_speed: 7.8,
      max_speed: 15.2,
      min_speed: 0,
      avg_cadence: 82,
      max_cadence: 110,
      min_cadence: 0,
      vo2max: 45.2,
      activities_count: 87,
    });
    expect(parsed.vo2max).toBe(45.2);
  });
});

describe('AnalyticsSnapshotCreateSchema', () => {
  it('accepts a realistic POST /api/analytics-snapshot body (camelCase, nested groups)', () => {
    const parsed = AnalyticsSnapshotCreateSchema.parse({
      lastActivityId: 123456,
      power: { avg: 180, max: 620, min: 0 },
      heart: { avg: 142, max: 178, min: 60 },
      speed: { avg: 7.8, max: 15.2, min: 0 },
      cadence: { avg: 82, max: 110, min: 0 },
      vo2max: 45.2,
      activitiesCount: 87,
    });
    expect(parsed.power?.avg).toBe(180);
  });

  it('rejects a missing lastActivityId', () => {
    const result = AnalyticsSnapshotCreateSchema.safeParse({ power: { avg: 100 } });
    expect(result.success).toBe(false);
  });
});
