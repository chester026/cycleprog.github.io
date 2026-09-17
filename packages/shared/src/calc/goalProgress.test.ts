import { describe, expect, it } from 'vitest';
import {
  computeGoalProgress,
  computePace,
  calculateLegacyGoalProgress,
  goalProgressSource,
} from './goalProgress.js';
import type { GoalProgressActivityInput } from './goalProgress.js';

const NOW = new Date('2026-06-30T00:00:00Z');

function ride(daysAgo: number, overrides: Partial<GoalProgressActivityInput> = {}): GoalProgressActivityInput {
  const start = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    type: 'Ride',
    distance: 30000,
    total_elevation_gain: 200,
    average_speed: 8, // m/s ≈ 28.8 km/h
    moving_time: 3600,
    start_date: start.toISOString(),
    name: 'Ride',
    ...overrides,
  };
}

describe('computeGoalProgress — activity source (metric-based)', () => {
  const activities = [
    ride(5, { distance: 30000, total_elevation_gain: 200, average_speed: 8, name: 'Flat spin' }),
    ride(15, { distance: 60000, total_elevation_gain: 1200, average_speed: 6, name: 'Climbing day' }),
    ride(25, { distance: 45000, total_elevation_gain: 300, average_speed: 7.5, name: 'Zwift interval session' }),
    ride(200, { distance: 100000, total_elevation_gain: 500, average_speed: 9, name: 'Out of range' }),
  ];

  it('sums distance within date range, transformed to km', () => {
    const goal = {
      metric: { source: 'activity' as const, aggregate: 'sum' as const, field: 'distance', transform: 0.001 },
      start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
      end_date: NOW.toISOString(),
    };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(135);
  });

  it('averages average_speed within range', () => {
    const goal = {
      metric: { source: 'activity' as const, aggregate: 'avg' as const, field: 'average_speed' },
      start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
      end_date: NOW.toISOString(),
    };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBeCloseTo((8 + 6 + 7.5) / 3);
  });

  it('counts activities matching a name_contains filter', () => {
    const goal = {
      metric: { source: 'activity' as const, aggregate: 'count' as const, filter: { name_contains: ['interval'] } },
      start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
      end_date: NOW.toISOString(),
    };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(1);
  });

  it('sums elevation only for rides meeting min_elevation_rate', () => {
    const goal = {
      metric: {
        source: 'activity' as const,
        aggregate: 'sum' as const,
        field: 'total_elevation_gain',
        filter: { min_elevation_rate: 0.015 },
      },
      start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
      end_date: NOW.toISOString(),
    };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(1200);
  });

  it('returns 0 when nothing falls in range', () => {
    const goal = {
      metric: { source: 'activity' as const, aggregate: 'sum' as const, field: 'distance' },
      start_date: '2030-01-01',
      end_date: '2030-01-31',
    };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(0);
  });

  it('max/min/median aggregates', () => {
    const range = { start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(), end_date: NOW.toISOString() };
    expect(
      computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'max', field: 'distance' } }, { activities, now: NOW }),
    ).toBe(60000);
    expect(
      computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'min', field: 'distance' } }, { activities, now: NOW }),
    ).toBe(30000);
    expect(
      computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'median', field: 'distance' } }, { activities, now: NOW }),
    ).toBe(45000);
  });
});

describe('computeGoalProgress — skills source', () => {
  it('reads the matching column from the snapshot', () => {
    const goal = { metric: { source: 'skills' as const, skill: 'climbing' } };
    const skillsSnapshot = { climbing: 72, sprint: 55 };
    expect(computeGoalProgress(goal, { skillsSnapshot })).toBe(72);
  });

  it('falls back to current_value with no snapshot', () => {
    const goal = { metric: { source: 'skills' as const, skill: 'climbing' }, current_value: 40 };
    expect(computeGoalProgress(goal, { skillsSnapshot: null })).toBe(40);
  });
});

describe('computeGoalProgress — health/coach sources (deliberately pass-through)', () => {
  it('health source ignores activities/skills and passes current_value through', () => {
    const goal = { metric: { source: 'health' as const, health_metric: 'hrv' }, current_value: 55 };
    expect(computeGoalProgress(goal, { activities: [ride(1)], skillsSnapshot: { climbing: 99 } })).toBe(55);
  });

  it('coach source passes current_value through', () => {
    const goal = { metric: { source: 'coach' as const }, current_value: 63 };
    expect(computeGoalProgress(goal, {})).toBe(63);
  });
});

describe('computeGoalProgress — legacy fallback (metric null)', () => {
  it('delegates to calculateLegacyGoalProgress for goal_type=distance', () => {
    const activities = [ride(5, { distance: 30000 }), ride(200, { distance: 999999 })];
    const goal = { metric: null, goal_type: 'distance', period: '4w' };
    expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(30);
  });

  it('falls back to stored current_value when goal_type is unrecognized (treated as manual, see below)', () => {
    const goal = { metric: null, goal_type: 'unknown_type', period: 'all', current_value: '17.5' };
    expect(computeGoalProgress(goal, { activities: [], now: NOW })).toBe(17.5);
  });

  describe('manual goals (metric null, unmapped goal_type e.g. "custom")', () => {
    it('passes current_value straight through instead of recomputing to 0 (T-3.4 fix)', () => {
      const goal = { metric: null, goal_type: 'custom', current_value: 42 };
      // Would be 0 under the raw legacy switch's default case — manual goals
      // must never be silently zeroed by GET /api/goals' write-back.
      expect(computeGoalProgress(goal, { activities: [], now: NOW })).toBe(42);
      expect(computeGoalProgress(goal, { activities: [ride(1)], now: NOW })).toBe(42);
    });

    it('goalProgressSource reports "manual" for it, "activity" for a mapped legacy type, and metric.source otherwise', () => {
      expect(goalProgressSource({ metric: null, goal_type: 'custom' })).toBe('manual');
      expect(goalProgressSource({ metric: null, goal_type: 'distance' })).toBe('activity');
      expect(goalProgressSource({ metric: { source: 'health', health_metric: 'hrv' } })).toBe('health');
      expect(goalProgressSource({ metric: { source: 'coach' } })).toBe('coach');
    });
  });

  describe('recovery — FIX: km/h, not m/s (T-3.4, the web bug this port avoids)', () => {
    it('counts only rides under 20 km/h, using the correct ×3.6 conversion', () => {
      const activities = [
        ride(1, { type: 'Ride', average_speed: 4 }), // 14.4 km/h -> recovery
        ride(2, { type: 'Ride', average_speed: 8 }), // 28.8 km/h -> not recovery
        ride(3, { type: 'VirtualRide', average_speed: 3 }), // 10.8 km/h -> recovery
      ];
      const goal = { metric: null, goal_type: 'recovery', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(2);
    });

    it('a ride at exactly the old (buggy) 20 m/s threshold would NOT count as recovery under the fixed km/h logic', () => {
      // 20 m/s = 72 km/h — nowhere near a recovery pace. The web's old bug
      // (`average_speed < 20`, no ×3.6) would have called this recovery;
      // this port must not.
      const activities = [ride(1, { type: 'Ride', average_speed: 19 })]; // 68.4 km/h
      const goal = { metric: null, goal_type: 'recovery', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });
  });

  describe('intervals — FIX: heuristic instead of always-0', () => {
    it('counts workout_type===3 and name-keyword matches instead of returning 0', () => {
      const activities = [
        ride(1, { workout_type: 3, name: 'Easy spin' }),
        ride(2, { name: 'VO2max session' }),
        ride(3, { name: 'Zwift интервал' }),
        ride(4, { name: 'Just a normal ride' }),
      ];
      const goal = { metric: null, goal_type: 'intervals', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(3);
    });

    it('also flags a ride via the speed-variation heuristic', () => {
      const activities = [
        ride(1, { name: 'Plain ride', average_speed: 8, max_speed: 13 }), // 28.8 km/h avg, ratio 1.625
      ];
      const goal = { metric: null, goal_type: 'intervals', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(1);
    });
  });

  describe('period filters — server `>=` semantics', () => {
    it('an activity exactly at the period boundary counts (>=, not >)', () => {
      const boundary = new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000);
      const activities = [ride(0, { start_date: boundary.toISOString(), distance: 10000 })];
      const goal = { metric: null, goal_type: 'distance', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(10);
    });

    it("period 'all' includes everything regardless of age", () => {
      const activities = [ride(2000, { distance: 5000 })];
      const goal = { metric: null, goal_type: 'distance', period: 'all' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(5);
    });

    it('unknown/missing period defaults to 28 days like the server', () => {
      const activities = [ride(20, { distance: 5000 }), ride(40, { distance: 9999 })];
      const goal = { metric: null, goal_type: 'distance', period: undefined };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(5);
    });
  });

  describe('avg_power (legacy physics model)', () => {
    it('computes a positive average power for flat, steady rides', () => {
      const activities = [
        ride(1, { distance: 30000, moving_time: 3600, total_elevation_gain: 100, average_speed: 8 }),
      ];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      const result = calculateLegacyGoalProgress(goal, activities, { weight: 75, bike_weight: 8 }, NOW);
      expect(result).toBeGreaterThan(0);
    });
  });
});

describe('computePace', () => {
  it('on track when actual is within 15% tolerance of expected', () => {
    const start = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const end = new Date(NOW.getTime() + 10 * 86400000).toISOString();
    const goal = { start_date: start, end_date: end, target_value: 100, current_value: 48 };
    const pace = computePace(goal, 48, NOW);
    expect(pace).not.toBeNull();
    expect(pace!.onTrack).toBe(true);
  });

  it('behind schedule when well under 85% of expected', () => {
    const start = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const end = new Date(NOW.getTime() + 10 * 86400000).toISOString();
    const goal = { start_date: start, end_date: end, target_value: 100, current_value: 20 };
    const pace = computePace(goal, 20, NOW);
    expect(pace!.onTrack).toBe(false);
    expect(pace!.percentDelta).toBeLessThan(0);
  });

  it('ahead of schedule when over expected', () => {
    const start = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const end = new Date(NOW.getTime() + 10 * 86400000).toISOString();
    const goal = { start_date: start, end_date: end, target_value: 100, current_value: 80 };
    const pace = computePace(goal, 80, NOW);
    expect(pace!.onTrack).toBe(true);
    expect(pace!.percentDelta).toBeGreaterThan(0);
  });

  it('returns null without both start_date and end_date', () => {
    expect(computePace({ target_value: 100, current_value: 50 })).toBeNull();
    expect(computePace({ start_date: '2026-01-01', target_value: 100, current_value: 50 })).toBeNull();
  });
});
