import { describe, expect, it } from 'vitest';
import { metaGoals } from './metaGoals.js';

describe('metaGoals contract', () => {
  it('list: response accepts a real GET /api/meta-goals array', () => {
    const r = metaGoals.list.response.safeParse([
      {
        id: 1,
        user_id: 1,
        title: 'Sub-3h century',
        status: 'active',
        tier: 'epic',
        ai_generated: true,
        ai_context: '{"trainingTypes":[]}',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
        trainingTypes: [],
        sub_goals: [{ id: 2, goal_type: 'distance', target_value: 100, current_value: 20 }],
      },
    ]);
    expect(r.success).toBe(true);
  });

  it('detail: response accepts the metaGoal/subGoals envelope', () => {
    const r = metaGoals.detail.response.safeParse({
      metaGoal: {
        id: 1,
        title: 'Sub-3h century',
        status: 'active',
        created_at: new Date(),
        readyToComplete: true,
      },
      subGoals: [{ id: 2, goal_type: 'distance', target_value: 100, current_value: 100 }],
    });
    expect(r.success).toBe(true);
  });

  it('create: body requires a title', () => {
    expect(metaGoals.create.body.safeParse({}).success).toBe(false);
    expect(metaGoals.create.body.safeParse({ title: 'x' }).success).toBe(true);
  });

  it('update: body rejects an invalid status', () => {
    expect(metaGoals.update.body.safeParse({ status: 'archived' }).success).toBe(false);
    expect(metaGoals.update.body.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('aiGenerate: response accepts a real handler payload', () => {
    const r = metaGoals.aiGenerate.response.safeParse({
      metaGoal: { id: 3, title: 'x', status: 'active', created_at: new Date() },
      subGoals: [{ id: 4, goal_type: 'distance', target_value: 200, current_value: 0 }],
      timeline: '4 weeks',
      mainFocus: 'endurance',
    });
    expect(r.success).toBe(true);
  });
});
