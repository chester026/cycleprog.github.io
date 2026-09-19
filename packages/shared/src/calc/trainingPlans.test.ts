import { describe, expect, it } from 'vitest';
import { getPlanDescription, getPlanFromProfile, getTrainingPlan, validatePlanParams } from './trainingPlans.js';

describe('trainingPlans (pure calc)', () => {
  it('scales the intermediate base plan by the 5h/week modifier (1.0x, i.e. unchanged)', () => {
    const plan = getTrainingPlan('intermediate', 5, null);
    expect(plan.rides).toBe(12);
    expect(plan.km).toBe(400);
    expect(plan.weeklyStructure.rides).toBe(3);
  });

  it('falls back to the intermediate plan for an unknown experience level', () => {
    const plan = getTrainingPlan('nonsense', 5, null);
    expect(plan.km).toBe(400);
    expect(plan.experienceLevel).toBe('intermediate');
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

  // Canonical `weeklyRidesModifier` formula (T-3.6, docs/audit/layers/
  // 04-cross-layer.md §4.7): `workoutsPerWeek / Math.round(basePlan.rides /
  // 4)` — the server's formula, not the deleted react-spa copy's
  // `workoutsPerWeek / basePlan.weeklyStructure.rides` (which divided by
  // the already time-scaled weekly ride count instead of the base plan's).
  // The two only actually disagree once `timeAvailable` scales
  // `weeklyStructure.rides` away from the base plan's own weekly figure.
  it('scales intervals down using the base plan weekly rides, not the time-scaled one, when workoutsPerWeek is fewer', () => {
    // intermediate base: rides=12 (3/week), intervals=8 (base).
    // timeAvailable=8h -> timeModifier=1.3 -> weeklyStructure.rides = round(3*1.3) = 4, intervals = round(8*1.3) = 10.
    // workoutsPerWeek=2: base weekly rides = round(12/4) = 3.
    //   weeklyRidesModifier = 2/3 (~0.667) — using the BASE weekly rides (3), not the time-scaled one (4).
    const plan = getTrainingPlan('intermediate', 8, 2);
    expect(plan.weeklyStructure.rides).toBe(2);
    expect(plan.rides).toBe(8); // workoutsPerWeek * 4 weeks
    expect(plan.intervals).toBe(Math.max(2, Math.round(10 * (2 / 3))));
  });

  it('leaves intervals alone when workoutsPerWeek is at or above the base weekly rides', () => {
    const plan = getTrainingPlan('intermediate', 5, 3);
    // weeklyRidesModifier = 3 / round(12/4) = 3/3 = 1 -> not < 1, intervals unchanged from the time-scaled value.
    expect(plan.intervals).toBe(8);
  });

  it('ignores an out-of-range workoutsPerWeek and keeps the time-scaled plan', () => {
    const plan = getTrainingPlan('intermediate', 5, 0);
    expect(plan.weeklyStructure.rides).toBe(3);
    expect(plan.rides).toBe(12);
  });

  it('falls back the time modifier to 1.0 when timeAvailable is not a usable number (e.g. NaN)', () => {
    // Math.max(1, NaN) / Math.min(10, NaN) are both NaN -> TIME_MODIFIERS[NaN]
    // is undefined -> the `?? 1.0` fallback kicks in (unlike every 1-10
    // integer input, which always has a table entry).
    const plan = getTrainingPlan('intermediate', NaN, null);
    expect(plan.timeModifier).toBe(1.0);
    expect(plan.rides).toBe(12); // base rides(12) * 1.0
  });

  it('falls back getPlanDescription to "Intermediate" for a plan whose experienceLevel is not a known key', () => {
    const plan = getTrainingPlan('intermediate', 5, null);
    (plan as { experienceLevel: string }).experienceLevel = 'bogus';
    expect(getPlanDescription(plan)).toBe(`Intermediate plan: ${plan.weeklyStructure.rides} rides/week, ${plan.weeklyStructure.volume}km/week`);
  });

  it('defaults every field of an empty user profile (falsy experience_level/time_available/workouts_per_week)', () => {
    const plan = getPlanFromProfile({});
    const expected = getTrainingPlan('intermediate', 5, null);
    expect(plan).toEqual(expected);
  });
});
