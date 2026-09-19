import { describe, expect, it } from 'vitest';
import { skills } from './skills.js';

describe('skills contract', () => {
  it('get accepts a real GET /api/skills payload with a previous snapshot + trend', () => {
    const result = skills.get.response.safeParse({
      skills: { climbing: 62, sprint: 48, endurance: 71, tempo: 55, power: 60, consistency: 80 },
      riderProfile: { profile: 'Climber', description: 'Strong on hills', emoji: '⛰️' },
      confidence: 0.8,
      sampleSize: 16,
      lastActivityId: 123456789,
      previous: {
        id: 1,
        user_id: 42,
        snapshot_date: new Date('2026-08-01T00:00:00Z'),
        climbing: 58,
        sprint: 45,
        endurance: 68,
        tempo: 52,
        power: 57,
        consistency: 75,
        last_activity_id: 123400000,
        created_at: new Date('2026-08-01T00:00:00Z'),
      },
      trend: { climbing: 4, sprint: 3, endurance: 3, tempo: 3, power: 3, consistency: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('get accepts no-history yet (previous/trend null)', () => {
    const result = skills.get.response.safeParse({
      skills: { climbing: 0, sprint: 0, endurance: 0, tempo: 0, power: 0, consistency: 0 },
      riderProfile: { profile: 'Newcomer', description: 'Just getting started', emoji: '🌱' },
      confidence: 0,
      sampleSize: 0,
      lastActivityId: null,
      previous: null,
      trend: null,
    });
    expect(result.success).toBe(true);
  });

  it('historyRange accepts the ?limit= array shape', () => {
    const result = skills.historyRange.response.safeParse([
      { id: 1, snapshot_date: new Date(), climbing: 62, sprint: 48, endurance: 71, tempo: 55, power: 60, consistency: 80, created_at: new Date() },
    ]);
    expect(result.success).toBe(true);
  });

  it('historyRange accepts the date-window {user_id, snapshots} shape', () => {
    const result = skills.historyRange.response.safeParse({
      user_id: 42,
      snapshots: [{ snapshot_date: '2026-09-01', climbing: 62, sprint: 48, endurance: 71, tempo: 55, power: 60, consistency: 80 }],
    });
    expect(result.success).toBe(true);
  });

  it('historyCreate body accepts the LEGACY_MOBILE_COMPAT bare body', () => {
    const result = skills.historyCreate.body!.safeParse({});
    expect(result.success).toBe(true);
  });

  it('historyCreate body accepts a full admin-manual payload', () => {
    const result = skills.historyCreate.body!.safeParse({
      climbing: 62, sprint: 48, endurance: 71, tempo: 55, power: 60, consistency: 80, last_activity_id: 123,
    });
    expect(result.success).toBe(true);
  });
});
