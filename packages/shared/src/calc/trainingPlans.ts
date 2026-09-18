// Single training-plan generator (T-3.6, docs/audit/00-AUDIT-AND-PLAN.md
// T-3.6, docs/audit/layers/04-cross-layer.md §4.7). Replaces two near-
// identical copies: `server/trainingPlans.js` (canonical — the server is
// the only one with a route, `GET /api/training-plan` uses a *different*,
// AI-goal-based generator; this pure function backs the analytics-summary
// plan/progress numbers instead) and the now-deleted `react-spa/src/utils/
// trainingPlans.js`.
//
// The two copies disagreed on one formula: when a user picks a specific
// `workoutsPerWeek`, how much that should scale down `intervals` (fewer
// rides -> lower intensity too). react-spa divided by the *modified*
// plan's `weeklyStructure.rides` (i.e. by the already-time-scaled weekly
// ride count); the server divided by `Math.round(basePlan.rides / 4)`
// (the *base*, unscaled plan's weekly ride count). Only the server's
// formula ever ran against real users (react-spa's copy was dead — its one
// call site, `WeeklyTrainingCalendar.jsx`, already used the server's
// `GET /api/training-plan` route instead of this generator), so this is
// the version being kept: `weeklyRidesModifier = workoutsPerWeek /
// Math.round(basePlan.rides / 4)`.
import type { ExperienceLevel } from '../constants/goalTypes.js';

export interface TrainingPlanBase {
  rides: number;
  km: number;
  long: number;
  intervals: number;
  description: string;
  weeklyStructure: {
    rides: number;
    volume: number;
    longRides: number;
    intervals: number;
  };
}

export const TRAINING_PLANS: Record<ExperienceLevel, TrainingPlanBase> = {
  beginner: {
    rides: 8,
    km: 200,
    long: 2,
    intervals: 4,
    description: 'Basic plan for beginners',
    weeklyStructure: { rides: 2, volume: 50, longRides: 0.5, intervals: 1 },
  },
  intermediate: {
    rides: 12,
    km: 400,
    long: 4,
    intervals: 8,
    description: 'Balanced intermediate plan',
    weeklyStructure: { rides: 3, volume: 100, longRides: 1, intervals: 2 },
  },
  advanced: {
    rides: 16,
    km: 600,
    long: 6,
    intervals: 12,
    description: 'Intense advanced plan',
    weeklyStructure: { rides: 4, volume: 150, longRides: 1.5, intervals: 3 },
  },
};

/** Scales the base 4-week plan by how much weekly training time the user has (1-10h/week). */
export const TIME_MODIFIERS: Record<number, number> = {
  1: 0.3,
  2: 0.5,
  3: 0.7,
  4: 0.8,
  5: 1.0,
  6: 1.1,
  7: 1.2,
  8: 1.3,
  9: 1.4,
  10: 1.5,
};

export interface TrainingPlan {
  rides: number;
  km: number;
  long: number;
  intervals: number;
  description: string;
  experienceLevel: ExperienceLevel;
  timeAvailable: number;
  timeModifier: number;
  weeklyStructure: {
    rides: number;
    volume: number;
    longRides: number;
    intervals: number;
  };
}

export interface UserProfileForPlan {
  experience_level?: string | null;
  time_available?: number | null;
  workouts_per_week?: number | null;
}

/**
 * Builds a 4-week training plan from an experience level, weekly time
 * budget (1-10h) and, optionally, a preferred weekly ride count.
 */
export function getTrainingPlan(
  experienceLevel: string = 'intermediate',
  timeAvailable: number = 5,
  workoutsPerWeek: number | null = null,
): TrainingPlan {
  const basePlan = TRAINING_PLANS[experienceLevel as ExperienceLevel] || TRAINING_PLANS.intermediate;
  const timeModifier = TIME_MODIFIERS[Math.min(10, Math.max(1, timeAvailable))] ?? 1.0;

  const plan: TrainingPlan = {
    rides: Math.max(4, Math.round(basePlan.rides * timeModifier)),
    km: Math.max(100, Math.round(basePlan.km * timeModifier)),
    long: Math.max(1, Math.round(basePlan.long * timeModifier)),
    intervals: Math.max(2, Math.round(basePlan.intervals * timeModifier)),
    description: basePlan.description,
    experienceLevel: (experienceLevel as ExperienceLevel) in TRAINING_PLANS ? (experienceLevel as ExperienceLevel) : 'intermediate',
    timeAvailable,
    timeModifier,
    weeklyStructure: {
      rides: Math.max(1, Math.round(basePlan.weeklyStructure.rides * timeModifier)),
      volume: Math.max(25, Math.round(basePlan.weeklyStructure.volume * timeModifier)),
      longRides: Math.max(0.25, basePlan.weeklyStructure.longRides * timeModifier),
      intervals: Math.max(0.5, Math.round(basePlan.weeklyStructure.intervals * timeModifier)),
    },
  };

  if (workoutsPerWeek && workoutsPerWeek >= 1 && workoutsPerWeek <= 7) {
    // Canonical formula (see file header): scale relative to the BASE
    // plan's weekly ride count, not the time-modified one.
    const baseWeeklyRides = Math.round(basePlan.rides / 4);
    const weeklyRidesModifier = workoutsPerWeek / baseWeeklyRides;

    plan.rides = Math.max(4, Math.round(workoutsPerWeek * 4)); // 4 weeks
    plan.weeklyStructure.rides = workoutsPerWeek;

    if (weeklyRidesModifier < 1) {
      plan.intervals = Math.max(2, Math.round(plan.intervals * weeklyRidesModifier));
    }
  }

  return plan;
}

/** Human-readable one-liner for a plan, e.g. for a summary card. */
export function getPlanDescription(plan: TrainingPlan): string {
  const levelNames: Record<ExperienceLevel, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  };
  const levelName = levelNames[plan.experienceLevel] || 'Intermediate';
  return `${levelName} plan: ${plan.weeklyStructure.rides} rides/week, ${plan.weeklyStructure.volume}km/week`;
}

/** Builds a plan from a user profile, defaulting missing fields the same way `getTrainingPlan` does. */
export function getPlanFromProfile(userProfile: UserProfileForPlan | null | undefined): TrainingPlan {
  if (!userProfile) return getTrainingPlan('intermediate', 5, 3);
  const experienceLevel = userProfile.experience_level || 'intermediate';
  const timeAvailable = userProfile.time_available || 5;
  const workoutsPerWeek = userProfile.workouts_per_week || null;
  return getTrainingPlan(experienceLevel, timeAvailable, workoutsPerWeek);
}

export interface PlanParamsValidation {
  isValid: boolean;
  errors: string[];
}

/** Validates plan-generation inputs (e.g. before accepting them from a client). */
export function validatePlanParams(
  experienceLevel: string,
  timeAvailable: number,
  workoutsPerWeek: number | null,
): PlanParamsValidation {
  const errors: string[] = [];

  if (!['beginner', 'intermediate', 'advanced'].includes(experienceLevel)) {
    errors.push('Invalid experience level');
  }
  if (timeAvailable < 1 || timeAvailable > 10) {
    errors.push('Time available must be between 1 and 10 hours per week');
  }
  if (workoutsPerWeek !== null && (workoutsPerWeek < 1 || workoutsPerWeek > 7)) {
    errors.push('Workouts per week must be between 1 and 7');
  }

  return { isValid: errors.length === 0, errors };
}
