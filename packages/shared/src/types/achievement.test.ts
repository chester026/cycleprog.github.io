import { describe, expect, it } from 'vitest';
import { AchievementSchema, UserAchievementsResponseSchema } from './achievement.js';

describe('AchievementSchema', () => {
  it('parses a realistic GET /api/achievements/me item', () => {
    const parsed = AchievementSchema.parse({
      id: 1,
      key: 'century_rider',
      category: 'distance',
      tier: 'gold',
      name: 'Century Rider',
      description: 'Ride 100km in one go',
      icon: 'medal',
      metric: 'distance',
      threshold: 100000,
      condition_type: 'max',
      sort_order: 1,
      current_value: 82000,
      unlocked: false,
      unlocked_at: null,
      trigger_activity_id: null,
      progress_pct: 82,
    });
    expect(parsed.progress_pct).toBe(82);
  });

  it('rejects a missing threshold', () => {
    const result = AchievementSchema.safeParse({
      id: 1,
      key: 'x',
      category: 'x',
      tier: 'gold',
      name: 'x',
      description: 'x',
      icon: 'x',
      metric: 'x',
      condition_type: 'max',
      current_value: 0,
      unlocked: false,
      unlocked_at: null,
      trigger_activity_id: null,
      progress_pct: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('UserAchievementsResponseSchema', () => {
  it('parses the GET /api/achievements/me response envelope', () => {
    const parsed = UserAchievementsResponseSchema.parse({
      achievements: [],
      stats: { total: 20, unlocked: 5, progress_pct: 25 },
    });
    expect(parsed.stats.progress_pct).toBe(25);
  });
});
