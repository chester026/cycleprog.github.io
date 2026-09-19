import { describe, expect, it } from 'vitest';
import { goals } from './goals.js';

describe('goals contract', () => {
  it('list: response accepts a real GET /api/goals array', () => {
    const r = goals.list.response.safeParse([
      {
        id: 1,
        user_id: 1,
        meta_goal_id: null,
        title: 'FTP',
        goal_type: 'ftp_vo2max',
        target_value: '120',
        current_value: '95',
        unit: 'W',
        period: '4w',
        vo2max_value: '48.2',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    expect(r.success).toBe(true);
  });

  it('create: body rejects a missing goal_type', () => {
    const r = goals.create.body.safeParse({ title: 'x', target_value: 100 });
    expect(r.success).toBe(false);
  });

  it('remove: response accepts { success }', () => {
    expect(goals.remove.response.safeParse({ success: true }).success).toBe(true);
  });

  it('recalcVo2max: response accepts a real handler payload', () => {
    const r = goals.recalcVo2max.response.safeParse({
      success: true,
      goal_id: '7',
      old_vo2max: null,
      vo2max_value: 49.1,
      updated_goal: { id: 7, goal_type: 'ftp_vo2max', target_value: 120, current_value: 0 },
    });
    expect(r.success).toBe(true);
  });

  it('updateCurrent: response accepts a real handler payload', () => {
    const r = goals.updateCurrent.response.safeParse({
      success: true,
      updated: 2,
      goals: [{ id: 1, goal_type: 'vo2max', target_value: 55, current_value: 48 }],
    });
    expect(r.success).toBe(true);
  });

  it('recommendations: response accepts the null-recommendations shape', () => {
    const r = goals.recommendations.response.safeParse({
      goal: { id: 1, goal_type: 'manual', target_value: 1, current_value: 0 },
      recommendations: null,
      message: 'Рекомендации для данного типа цели не найдены',
    });
    expect(r.success).toBe(true);
  });
});
