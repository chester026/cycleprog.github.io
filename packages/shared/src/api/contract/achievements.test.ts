import { describe, expect, it } from 'vitest';
import { achievements } from './achievements.js';

describe('achievements contract', () => {
  it('list accepts a raw achievements table row', () => {
    const result = achievements.list.response.safeParse([
      {
        id: 1,
        key: 'trail_mark',
        category: 'climbing',
        tier: 'silver',
        name: 'Trail Mark',
        description: 'Climb a total of 1,000m elevation',
        icon: '🗻',
        metric: 'total_elevation_gain',
        threshold: 1000,
        condition_type: 'cumulative',
        sort_order: 1,
        extra: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('me accepts the per-user progress envelope', () => {
    const result = achievements.me.response.safeParse({
      achievements: [
        {
          id: 1,
          key: 'trail_mark',
          category: 'climbing',
          tier: 'silver',
          name: 'Trail Mark',
          description: 'Climb a total of 1,000m elevation',
          icon: '🗻',
          metric: 'total_elevation_gain',
          threshold: 1000,
          condition_type: 'cumulative',
          current_value: 400,
          unlocked: false,
          unlocked_at: null,
          trigger_activity_id: null,
          progress_pct: 40,
        },
      ],
      stats: { total: 1, unlocked: 0, progress_pct: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('evaluate accepts a real newly-unlocked payload with Date timestamps', () => {
    const result = achievements.evaluate.response.safeParse({
      newly_unlocked: [
        {
          id: 2,
          achievement_id: 2,
          key: 'hill_breaker',
          category: 'climbing',
          tier: 'silver',
          name: 'Hill Breaker',
          description: 'Gain 500m elevation in a single ride',
          icon: '🪨',
          metric: 'elevation_gain',
          threshold: 500,
          condition_type: 'single_ride',
          sort_order: 2,
          current_value: 520,
          unlocked: true,
          unlocked_at: new Date('2026-09-01T12:00:00Z'),
          trigger_activity_id: 987654321,
          updated_at: new Date('2026-09-01T12:00:00Z'),
        },
      ],
      total_unlocked: 3,
      total_achievements: 46,
    });
    expect(result.success).toBe(true);
  });

  it('evaluate accepts no new unlocks', () => {
    const result = achievements.evaluate.response.safeParse({
      newly_unlocked: [],
      total_unlocked: 2,
      total_achievements: 46,
    });
    expect(result.success).toBe(true);
  });
});
