import { describe, it, expect } from 'vitest';
import { getTrainingPlan, getPlanDescription, getPlanFromProfile, validatePlanParams } from '../trainingPlans';

describe('trainingPlans (pure utils)', () => {
  it('scales the intermediate base plan by the 5h/week modifier (1.0x, i.e. unchanged)', () => {
    const plan = getTrainingPlan('intermediate', 5, null);
    expect(plan.rides).toBe(12);
    expect(plan.km).toBe(400);
    expect(plan.weeklyStructure.rides).toBe(3);
  });

  it('falls back to the intermediate plan for an unknown experience level', () => {
    const plan = getTrainingPlan('nonsense', 5, null);
    expect(plan.km).toBe(400);
  });

  it('builds a human-readable description from a plan', () => {
    const plan = getTrainingPlan('beginner', 5, null);
    expect(getPlanDescription(plan)).toBe('Beginner plan: 2 rides/week, 50km/week');
  });

  it('derives a plan from a user profile, defaulting missing fields', () => {
    const plan = getPlanFromProfile({ experience_level: 'advanced', time_available: 5 });
    expect(plan.rides).toBe(16);
    expect(getPlanFromProfile(null).experienceLevel).toBe('intermediate');
  });

  it('validates plan params and reports out-of-range errors', () => {
    expect(validatePlanParams('intermediate', 5, 3).isValid).toBe(true);
    const invalid = validatePlanParams('expert', 15, 9);
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toHaveLength(3);
  });
});
