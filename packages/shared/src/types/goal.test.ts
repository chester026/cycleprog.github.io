import { describe, expect, it } from 'vitest';
import {
  GoalSchema,
  GoalCreateSchema,
  GoalUpdateSchema,
  MetaGoalSchema,
  MetaGoalDetailSchema,
} from './goal.js';

describe('GoalSchema', () => {
  it('parses a realistic GET /api/goals item (declarative metric)', () => {
    const goal = {
      id: 1,
      user_id: 42,
      meta_goal_id: 7,
      title: 'Distance',
      goal_type: 'distance',
      target_value: 400,
      current_value: 123.4,
      unit: 'km',
      period: '4w',
      source: 'activity',
      metric: { source: 'activity', aggregate: 'sum', field: 'distance', transform: 0.001 },
      percent: 31,
      pace: {
        daysElapsed: 10,
        daysRemaining: 18,
        expectedValue: 142.9,
        onTrack: false,
        percentDelta: -13.6,
      },
      hr_threshold: 160,
      duration_threshold: 120,
    };
    const parsed = GoalSchema.parse(goal);
    expect(parsed.metric?.field).toBe('distance');
    expect(parsed.pace?.onTrack).toBe(false);
  });

  it('parses a legacy goal (metric null)', () => {
    const parsed = GoalSchema.parse({
      id: 2,
      goal_type: 'ftp_vo2max',
      target_value: 120,
      current_value: 0,
      metric: null,
    });
    expect(parsed.metric).toBeNull();
  });

  it('rejects an unknown metric field', () => {
    const result = GoalSchema.safeParse({
      id: 3,
      goal_type: 'distance',
      target_value: 100,
      current_value: 0,
      metric: { source: 'activity', aggregate: 'sum', field: 'not_a_real_field' },
    });
    expect(result.success).toBe(false);
  });
});

describe('GoalCreateSchema / GoalUpdateSchema', () => {
  it('accepts empty-string numeric fields as sent by the web form (coerced to 0)', () => {
    const parsed = GoalCreateSchema.parse({
      title: "A's goal",
      target_value: '',
      current_value: '',
      unit: 'km',
      goal_type: 'distance',
      meta_goal_id: 7,
    });
    expect(parsed.target_value).toBe(0);
  });

  it('accepts a partial update', () => {
    const parsed = GoalUpdateSchema.parse({ current_value: 55 });
    expect(parsed.current_value).toBe(55);
  });

  it('rejects a missing goal_type on create', () => {
    const result = GoalCreateSchema.safeParse({ title: 'x', target_value: 1 });
    expect(result.success).toBe(false);
  });
});

describe('MetaGoalSchema / MetaGoalDetailSchema', () => {
  it('parses a GET /api/meta-goals/:id response envelope', () => {
    const parsed = MetaGoalDetailSchema.parse({
      metaGoal: {
        id: 7,
        title: 'Sub-3h century',
        status: 'active',
        tier: 'epic',
        created_at: '2026-01-01T00:00:00Z',
        trainingTypes: [{ type: 'endurance', title: 'Endurance', description: '...', priority: 1 }],
        readyToComplete: false,
      },
      subGoals: [
        { id: 1, goal_type: 'distance', target_value: 100, current_value: 50 },
      ],
    });
    expect(parsed.metaGoal.tier).toBe('epic');
    expect(parsed.subGoals).toHaveLength(1);
  });

  it('rejects an invalid status', () => {
    const result = MetaGoalSchema.safeParse({
      id: 1,
      title: 'x',
      status: 'archived',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});
