import { describe, expect, it } from 'vitest';
import { training } from './training.js';

describe('training contract', () => {
  it('plan: response accepts a real GET /api/training-plan payload', () => {
    const r = training.plan.response.safeParse({
      plan: { monday: { type: 'endurance' } },
      analysis: { strengths: [], weaknesses: [] },
      priorities: ['endurance'],
      userProfile: { experience_level: 'intermediate' },
      customPlan: { monday: { type: 'rest', name: 'Отдых', description: 'День отдыха' } },
      weekStartDate: '2026-09-14',
      isFallbackPlan: false,
      fallbackMessage: null,
    });
    expect(r.success).toBe(true);
  });

  it('typeDetail: response accepts a training-types.json entry', () => {
    const r = training.typeDetail.response.safeParse({
      key: 'endurance',
      name: 'Endurance',
      description: 'Long steady rides',
      benefits: ['Aerobic base'],
    });
    expect(r.success).toBe(true);
  });

  it('stats: response accepts the totalGoals/averageProgress shape', () => {
    expect(training.stats.response.safeParse({ totalGoals: 3, averageProgress: 42.5 }).success).toBe(true);
  });

  it('saveCustom: body requires dayKey and training', () => {
    expect(training.saveCustom.body.safeParse({ dayKey: 'monday' }).success).toBe(false);
    expect(
      training.saveCustom.body.safeParse({ dayKey: 'monday', training: { type: 'rest', name: 'Rest' } }).success
    ).toBe(true);
  });

  it('deleteCustom: response accepts { success }', () => {
    expect(training.deleteCustom.response.safeParse({ success: true }).success).toBe(true);
  });
});
