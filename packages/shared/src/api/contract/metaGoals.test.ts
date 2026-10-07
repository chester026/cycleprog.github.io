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

  const ride = {
    strava_id: 17000000001,
    name: 'Garda loop',
    start_date: '2026-10-03T05:00:00.000Z',
    distance: 142300,
    moving_time: 18000,
    total_elevation_gain: 1450,
    average_speed: 7.9,
    attached_at: '2026-10-04T08:00:00.000Z',
  };
  const goal = { id: 1, title: 'Half of Island', status: 'completed', created_at: '2026-09-01T00:00:00Z' };

  it('detail: response accepts rides beside the metaGoal', () => {
    const r = metaGoals.detail.response.safeParse({ metaGoal: goal, subGoals: [], rides: [ride] });
    expect(r.success).toBe(true);
  });

  it('complete: body is optional-fielded; response is the goal plus rides', () => {
    expect(metaGoals.complete.body.safeParse({}).success).toBe(true);
    expect(metaGoals.complete.body.safeParse({ activity_ids: [1, 2], completed_at: '2026-10-03T05:00:00Z' }).success).toBe(true);
    expect(metaGoals.complete.body.safeParse({ activity_ids: ['x'] }).success).toBe(false);
    expect(metaGoals.complete.response.safeParse({ ...goal, completed_at: '2026-10-03T05:00:00Z', rides: [ride] }).success).toBe(true);
    expect(metaGoals.complete.response.safeParse(goal).success).toBe(false);
  });

  it('rides: response accepts rides with nullable ride stats', () => {
    const bare = { ...ride, name: null, start_date: null, distance: null, moving_time: null, total_elevation_gain: null, average_speed: null };
    expect(metaGoals.rides.response.safeParse({ rides: [ride, bare] }).success).toBe(true);
    expect(metaGoals.reopen.response.safeParse({ ...goal, status: 'active', completed_at: null }).success).toBe(true);
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
