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

describe('computeGoalProgress — activity source, applyActivityFilter fields', () => {
  const range = { start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(), end_date: NOW.toISOString() };
  // A1: short, flat, slow, short-duration ride. A2: long, hilly, fast, long-duration ride.
  const a1 = ride(5, { distance: 5000, total_elevation_gain: 50, average_speed: 5, moving_time: 600, type: 'Ride' });
  const a2 = ride(6, { distance: 20000, total_elevation_gain: 1000, average_speed: 10, moving_time: 5000, type: 'Run' });
  const activities = [a1, a2];

  function countWith(filter: Record<string, unknown>, acts: GoalProgressActivityInput[] = activities) {
    return computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'count', filter } }, { activities: acts, now: NOW });
  }

  it('type_in keeps only matching activity types', () => {
    expect(countWith({ type_in: ['Ride'] })).toBe(1); // only a1
  });

  it('a filter runs every computed field (distance/elevation/speed/elevRate/name/time) against an activity missing all of them, without throwing', () => {
    // Every `a.<field> || 0`/`|| ''` fallback in applyActivityFilter's setup
    // runs unconditionally for each activity, regardless of which specific
    // filter field is checked — this activity has none of them set.
    const blank = ride(9, { distance: undefined, total_elevation_gain: undefined, average_speed: undefined, moving_time: undefined, name: undefined, type: undefined });
    expect(countWith({ type_in: ['Ride'] }, [blank])).toBe(0); // a.type||'' -> '' -> not in type_in
  });

  it('min_distance excludes shorter rides', () => {
    expect(countWith({ min_distance: 10000 })).toBe(1); // only a2 (20000 >= 10000)
  });

  it('max_distance excludes longer rides', () => {
    expect(countWith({ max_distance: 10000 })).toBe(1); // only a1 (5000 <= 10000)
  });

  it('max_elevation_rate excludes rides above the elevation-per-distance cap', () => {
    // a1: 50/5000 = 0.01, a2: 1000/20000 = 0.05.
    expect(countWith({ max_elevation_rate: 0.02 })).toBe(1); // only a1
  });

  it('max_elevation excludes rides with too much total climbing', () => {
    expect(countWith({ max_elevation: 500 })).toBe(1); // only a1 (50 <= 500)
  });

  it('min_speed excludes slower rides', () => {
    // a1: 18km/h, a2: 36km/h.
    expect(countWith({ min_speed: 25 })).toBe(1); // only a2
  });

  it('max_speed excludes faster rides', () => {
    expect(countWith({ max_speed: 25 })).toBe(1); // only a1
  });

  it('min_moving_time excludes shorter-duration rides', () => {
    expect(countWith({ min_moving_time: 1000 })).toBe(1); // only a2 (5000 >= 1000)
  });

  it('the date range excludes an activity that falls after end_date (not just before start_date)', () => {
    // start_date far in the past (every activity passes the start check) but
    // end_date excludes the newer of the two -> exercises `date > end` (the
    // second date-range check), not just `date < start`.
    const inRange = ride(15, { distance: 1000 });
    const afterEnd = ride(1, { distance: 1000 });
    const goal = {
      metric: { source: 'activity' as const, aggregate: 'count' as const },
      start_date: '2000-01-01',
      end_date: new Date(NOW.getTime() - 10 * 86400000).toISOString(),
    };
    expect(computeGoalProgress(goal, { activities: [inRange, afterEnd], now: NOW })).toBe(1);
  });
});

describe('computeGoalProgress — activity source, aggregate edge cases', () => {
  const emptyRange = { start_date: '2030-01-01', end_date: '2030-01-31' };

  it('avg returns 0 when nothing matches the filter/date-range', () => {
    const goal = { ...emptyRange, metric: { source: 'activity' as const, aggregate: 'avg' as const, field: 'distance' } };
    expect(computeGoalProgress(goal, { activities: [ride(1)], now: NOW })).toBe(0);
  });

  it('median returns 0 when nothing matches the filter/date-range', () => {
    const goal = { ...emptyRange, metric: { source: 'activity' as const, aggregate: 'median' as const, field: 'distance' } };
    expect(computeGoalProgress(goal, { activities: [ride(1)], now: NOW })).toBe(0);
  });

  it('an unrecognized aggregate falls to the default case (returns 0)', () => {
    const goal = {
      start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
      end_date: NOW.toISOString(),
      metric: { source: 'activity' as const, aggregate: 'bogus' as unknown as 'sum', field: 'distance' },
    };
    expect(computeGoalProgress(goal, { activities: [ride(1)], now: NOW })).toBe(0);
  });
});

describe('computeGoalProgress — unrecognized metric.source falls to the default case', () => {
  it('returns 0 for a metric.source not in {activity, skills, health, coach}', () => {
    const goal = { metric: { source: 'bogus' as unknown as 'activity' } };
    expect(computeGoalProgress(goal, {})).toBe(0);
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

  it('health/coach fall back to 0 when there is no current_value at all', () => {
    expect(computeGoalProgress({ metric: { source: 'health' as const } }, {})).toBe(0);
    expect(computeGoalProgress({ metric: { source: 'coach' as const } }, {})).toBe(0);
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

  it('falls back to 0 for a manual/unmapped goal_type with no current_value at all', () => {
    const goal = { metric: null, goal_type: 'unknown_type' };
    expect(computeGoalProgress(goal, { activities: [], now: NOW })).toBe(0);
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

    it('floors power at 20W on a flat/descending grade (averageGrade <= 0)', () => {
      const activities = [ride(1, { distance: 40000, moving_time: 6000, total_elevation_gain: 0, average_speed: 3 })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      const result = calculateLegacyGoalProgress(goal, activities, { weight: 75, bike_weight: 8 }, NOW);
      expect(result).toBeGreaterThanOrEqual(20);
    });

    it('returns 0 when every activity is <=1000m (excluded before the physics model even runs)', () => {
      const activities = [ride(1, { distance: 500 })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('excludes an activity with distance undefined (falls back to 0, same as <=1000m)', () => {
      const activities = [ride(1, { distance: undefined })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('returns 0 when a >1000m activity still has no usable time/speed data (each yields 0W, filtered out)', () => {
      const activities = [ride(1, { distance: 30000, moving_time: 0, average_speed: 0 })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('uses a supplied average_temp (converted to Kelvin) instead of the 15C default', () => {
      const activities = [ride(1, { distance: 30000, moving_time: 3600, total_elevation_gain: 100, average_speed: 8, average_temp: 30, elev_high: 500 })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      const withTemp = calculateLegacyGoalProgress(goal, activities, { weight: 75, bike_weight: 8 }, NOW);
      const withoutTemp = calculateLegacyGoalProgress(
        goal,
        [ride(1, { distance: 30000, moving_time: 3600, total_elevation_gain: 100, average_speed: 8 })],
        { weight: 75, bike_weight: 8 },
        NOW,
      );
      // Warmer air is less dense -> less aero drag -> a (slightly) different result.
      expect(withTemp).not.toBe(withoutTemp);
    });

    it('discards an implausible (>10000W) estimate from an absurd average_speed instead of returning it', () => {
      // Legacy formula reads `average_speed` directly (not distance/time) — a
      // huge value cubes into an aero term far above the 10000W ceiling.
      const activities = [ride(1, { distance: 30000, moving_time: 3600, total_elevation_gain: 0, average_speed: 1000 })];
      const goal = { metric: null, goal_type: 'avg_power', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, { weight: 75, bike_weight: 8 }, NOW)).toBe(0);
    });
  });

  describe('elevation/time/long_rides/speed_flat/speed_hills/cadence/pulse/avg_hr_flat/avg_hr_hills', () => {
    it('elevation sums total_elevation_gain, rounded', () => {
      const activities = [ride(1, { total_elevation_gain: 300.4 }), ride(2, { total_elevation_gain: 200.4 })];
      const goal = { metric: null, goal_type: 'elevation', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(Math.round(300.4 + 200.4));
    });

    it('time sums moving_time in hours, one decimal', () => {
      const activities = [ride(1, { moving_time: 3600 }), ride(2, { moving_time: 1800 })];
      const goal = { metric: null, goal_type: 'time', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(1.5);
    });

    it('long_rides counts rides over 50km OR over 2.5h', () => {
      const activities = [
        ride(1, { distance: 60000, moving_time: 3600 }), // long by distance
        ride(2, { distance: 10000, moving_time: 3 * 3600 }), // long by time
        ride(3, { distance: 10000, moving_time: 3600 }), // neither
      ];
      const goal = { metric: null, goal_type: 'long_rides', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(2);
    });

    it('speed_flat averages speed over flat (low-elevation-rate) rides only', () => {
      const activities = [
        ride(1, { distance: 20000, total_elevation_gain: 100, average_speed: 8 }), // flat: rate 0.005 < 0.02, elev < 500
        ride(2, { distance: 20000, total_elevation_gain: 800, average_speed: 6 }), // hilly: elev 800 >= 500 -> excluded
        ride(3, { distance: 1000, total_elevation_gain: 5, average_speed: 5 }), // too short (<=3000) -> excluded
      ];
      const goal = { metric: null, goal_type: 'speed_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(parseFloat((8 * 3.6).toFixed(1)));
    });

    it('speed_flat returns 0 when no ride qualifies as flat', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 800, average_speed: 6 })];
      const goal = { metric: null, goal_type: 'speed_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('speed_hills averages speed over hilly, sub-25km/h rides only', () => {
      const activities = [
        ride(1, { distance: 20000, total_elevation_gain: 800, average_speed: 6 }), // hilly (elev>=500), 21.6km/h<25
        ride(2, { distance: 20000, total_elevation_gain: 100, average_speed: 8 }), // flat -> excluded
        ride(3, { distance: 20000, total_elevation_gain: 800, average_speed: 9 }), // hilly but 32.4km/h>=25 -> excluded
      ];
      const goal = { metric: null, goal_type: 'speed_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(parseFloat((6 * 3.6).toFixed(1)));
    });

    it('speed_hills returns 0 when no ride qualifies as a hilly, sub-25km/h ride', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 100, average_speed: 8 })];
      const goal = { metric: null, goal_type: 'speed_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('cadence averages average_cadence over rides that have it (>0), rounded', () => {
      const activities = [ride(1, { average_cadence: 85 }), ride(2, { average_cadence: 91 }), ride(3, { average_cadence: undefined })];
      const goal = { metric: null, goal_type: 'cadence', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(Math.round((85 + 91) / 2));
    });

    it('cadence returns 0 when no activity has cadence data', () => {
      const activities = [ride(1, { average_cadence: undefined })];
      const goal = { metric: null, goal_type: 'cadence', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('pulse averages average_heartrate over rides that have it (>0), rounded', () => {
      const activities = [ride(1, { average_heartrate: 140 }), ride(2, { average_heartrate: 150 }), ride(3, { average_heartrate: undefined })];
      const goal = { metric: null, goal_type: 'pulse', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(Math.round((140 + 150) / 2));
    });

    it('pulse returns 0 when no activity has heart-rate data', () => {
      const activities = [ride(1, { average_heartrate: undefined })];
      const goal = { metric: null, goal_type: 'pulse', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('avg_hr_flat averages HR over flat rides with HR data', () => {
      const activities = [
        ride(1, { distance: 20000, total_elevation_gain: 100, average_heartrate: 140 }), // flat, has HR
        ride(2, { distance: 20000, total_elevation_gain: 800, average_heartrate: 150 }), // hilly -> excluded
        ride(3, { distance: 20000, total_elevation_gain: 100, average_heartrate: undefined }), // flat but no HR -> excluded
      ];
      const goal = { metric: null, goal_type: 'avg_hr_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(140);
    });

    it('avg_hr_flat returns 0 when nothing qualifies', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 800, average_heartrate: 150 })];
      const goal = { metric: null, goal_type: 'avg_hr_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('avg_hr_hills averages HR over hilly rides with HR data', () => {
      const activities = [
        ride(1, { distance: 20000, total_elevation_gain: 800, average_heartrate: 160 }), // hilly, has HR
        ride(2, { distance: 20000, total_elevation_gain: 100, average_heartrate: 140 }), // flat -> excluded
        ride(3, { distance: 20000, total_elevation_gain: 800, average_heartrate: undefined }), // hilly but no HR -> excluded
      ];
      const goal = { metric: null, goal_type: 'avg_hr_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(160);
    });

    it('avg_hr_hills returns 0 when nothing qualifies', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 100, average_heartrate: 140 })];
      const goal = { metric: null, goal_type: 'avg_hr_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });
  });

  describe('unrecognized goal_type / empty period', () => {
    it('a goal_type with no switch case (e.g. "ftp_vo2max", a LEGACY_GOAL_TYPES entry the switch never implemented) falls to the default (0)', () => {
      const activities = [ride(1)];
      const goal = { metric: null, goal_type: 'ftp_vo2max', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('returns 0 immediately when the period contains no activities at all', () => {
      const activities = [ride(200)]; // outside any period below
      const goal = { metric: null, goal_type: 'distance', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });
  });

  // Every legacy case reads several `a.<field> || 0` (or `|| ''`) fallbacks.
  // These are exercised naturally whenever a real activity is missing that
  // field (e.g. a Strava activity with no cadence/HR sensor) — the cases
  // above always supplied every field, so these sparse-activity tests close
  // that gap explicitly, one field-fallback at a time.
  describe('missing/undefined fields fall back to 0 (or "") instead of throwing or NaN-ing', () => {
    it('distance: a ride with distance undefined contributes 0', () => {
      const activities = [ride(1, { distance: undefined })];
      const goal = { metric: null, goal_type: 'distance', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('elevation: a ride with total_elevation_gain undefined contributes 0', () => {
      const activities = [ride(1, { total_elevation_gain: undefined })];
      const goal = { metric: null, goal_type: 'elevation', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('time: a ride with moving_time undefined contributes 0', () => {
      const activities = [ride(1, { moving_time: undefined })];
      const goal = { metric: null, goal_type: 'time', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('long_rides: a ride with distance AND moving_time undefined is not counted (both fall back to 0)', () => {
      const activities = [ride(1, { distance: undefined, moving_time: undefined })];
      const goal = { metric: null, goal_type: 'long_rides', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('speed_flat: a ride with distance/elevation/speed all undefined is excluded by the (0) filter, contributing nothing', () => {
      const activities = [ride(1, { distance: undefined, total_elevation_gain: undefined, average_speed: undefined })];
      const goal = { metric: null, goal_type: 'speed_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('speed_flat: a ride that passes the filter but has average_speed undefined averages in as 0 km/h', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 100, average_speed: undefined })];
      const goal = { metric: null, goal_type: 'speed_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('speed_hills: a ride with distance/elevation/speed all undefined is excluded by the (0) filter', () => {
      const activities = [ride(1, { distance: undefined, total_elevation_gain: undefined, average_speed: undefined })];
      const goal = { metric: null, goal_type: 'speed_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('speed_hills: a hilly ride with average_speed undefined averages in as 0 km/h', () => {
      const activities = [ride(1, { distance: 20000, total_elevation_gain: 800, average_speed: undefined })];
      const goal = { metric: null, goal_type: 'speed_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('cadence: a ride with average_cadence undefined is excluded by the (falsy) filter', () => {
      const activities = [ride(1, { average_cadence: undefined })];
      const goal = { metric: null, goal_type: 'cadence', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('pulse: a ride with average_heartrate undefined is excluded by the (falsy) filter', () => {
      const activities = [ride(1, { average_heartrate: undefined })];
      const goal = { metric: null, goal_type: 'pulse', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('avg_hr_flat: a ride with distance/elevation/heartrate all undefined is excluded by the (0) filter', () => {
      const activities = [ride(1, { distance: undefined, total_elevation_gain: undefined, average_heartrate: undefined })];
      const goal = { metric: null, goal_type: 'avg_hr_flat', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('avg_hr_hills: a ride with distance/elevation/heartrate all undefined is excluded by the (0) filter', () => {
      const activities = [ride(1, { distance: undefined, total_elevation_gain: undefined, average_heartrate: undefined })];
      const goal = { metric: null, goal_type: 'avg_hr_hills', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('recovery: a ride with type undefined falls back to "" (excluded, "" is not Ride/VirtualRide)', () => {
      const activities = [ride(1, { type: undefined, average_speed: undefined })];
      const goal = { metric: null, goal_type: 'recovery', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('recovery: a ride with a valid type but average_speed undefined falls back to 0 km/h (counts as recovery)', () => {
      // Distinct from the case above: type_in check passes here, so the
      // `(a.average_speed || 0)` fallback actually runs (0 km/h < 20 -> recovery).
      const activities = [ride(1, { type: 'Ride', average_speed: undefined })];
      const goal = { metric: null, goal_type: 'recovery', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(1);
    });

    it('intervals: a ride with name undefined does not throw and is not (falsely) counted as an interval', () => {
      const activities = [ride(1, { name: undefined, average_speed: undefined, max_speed: undefined })];
      const goal = { metric: null, goal_type: 'intervals', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });

    it('intervals: a ride with a measurable but unremarkable speed ratio (<=1.4x or <=25km/h) is not counted', () => {
      // average_speed & max_speed both present (enters the speed-variation
      // branch) but the ratio/threshold condition itself is false — distinct
      // from a ride missing max_speed entirely (which skips the branch).
      const activities = [ride(1, { name: 'Plain ride', average_speed: 8, max_speed: 9 })]; // ratio 1.125, avg 28.8km/h
      const goal = { metric: null, goal_type: 'intervals', period: '4w' };
      expect(calculateLegacyGoalProgress(goal, activities, null, NOW)).toBe(0);
    });
  });

  describe('calculateActivityProgress — date-range/activities/field fallbacks', () => {
    it('treats a goal with no start_date/end_date as unbounded (both fall back to null)', () => {
      const activities = [ride(1, { distance: 10000 }), ride(400, { distance: 5000 })];
      const goal = { metric: { source: 'activity' as const, aggregate: 'sum' as const, field: 'distance' } };
      expect(computeGoalProgress(goal, { activities, now: NOW })).toBe(15000);
    });

    it('treats a null activities context as empty rather than throwing', () => {
      const goal = {
        start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
        end_date: NOW.toISOString(),
        metric: { source: 'activity' as const, aggregate: 'sum' as const, field: 'distance' },
      };
      expect(computeGoalProgress(goal, { activities: null as unknown as GoalProgressActivityInput[], now: NOW })).toBe(0);
    });

    it('sum/avg treat a non-numeric field value as 0 (Number(...) || 0 fallback)', () => {
      const activities = [ride(1, { distance: undefined })];
      const range = { start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(), end_date: NOW.toISOString() };
      expect(
        computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'sum', field: 'distance' } }, { activities, now: NOW }),
      ).toBe(0);
      expect(
        computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'avg', field: 'distance' } }, { activities, now: NOW }),
      ).toBe(0);
    });

    it('max/min return 0 for an empty filtered set, and treat a missing field as 0 otherwise', () => {
      const range = { start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(), end_date: NOW.toISOString() };
      const emptyRange = { start_date: '2030-01-01', end_date: '2030-01-31' };
      expect(
        computeGoalProgress(
          { ...emptyRange, metric: { source: 'activity', aggregate: 'max', field: 'distance' } },
          { activities: [ride(1)], now: NOW },
        ),
      ).toBe(0);
      expect(
        computeGoalProgress(
          { ...emptyRange, metric: { source: 'activity', aggregate: 'min', field: 'distance' } },
          { activities: [ride(1)], now: NOW },
        ),
      ).toBe(0);
      expect(
        computeGoalProgress(
          { ...range, metric: { source: 'activity', aggregate: 'max', field: 'distance' } },
          { activities: [ride(1, { distance: undefined })], now: NOW },
        ),
      ).toBe(0);
      expect(
        computeGoalProgress(
          { ...range, metric: { source: 'activity', aggregate: 'min', field: 'distance' } },
          { activities: [ride(1, { distance: undefined })], now: NOW },
        ),
      ).toBe(0);
    });

    it('median treats a missing field as 0, and averages the two middle values for an even-length set', () => {
      const range = { start_date: new Date(NOW.getTime() - 30 * 86400000).toISOString(), end_date: NOW.toISOString() };
      // One defined + one undefined distance -> values sorted [0, 10000], even length -> average = 5000.
      const activities = [ride(1, { distance: 10000 }), ride(2, { distance: undefined })];
      expect(
        computeGoalProgress({ ...range, metric: { source: 'activity', aggregate: 'median', field: 'distance' } }, { activities, now: NOW }),
      ).toBe(5000);
    });
  });

  describe('calculateSkillsProgress — missing skill key / current_value fallbacks', () => {
    it('returns 0 when there is no snapshot and no current_value at all', () => {
      const goal = { metric: { source: 'skills' as const, skill: 'climbing' } };
      expect(computeGoalProgress(goal, { skillsSnapshot: null })).toBe(0);
    });

    it("falls back to current_value when the snapshot exists but doesn't have that skill key", () => {
      const goal = { metric: { source: 'skills' as const, skill: 'climbing' }, current_value: 40 };
      expect(computeGoalProgress(goal, { skillsSnapshot: { sprint: 72 } })).toBe(40);
    });

    it('falls back to 0 when the snapshot lacks the key AND there is no current_value', () => {
      const goal = { metric: { source: 'skills' as const, skill: 'climbing' } };
      expect(computeGoalProgress(goal, { skillsSnapshot: { sprint: 72 } })).toBe(0);
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

  it('defaults target_value to 0 when missing (expectedValue then 0, percentDelta falls back to 0 too)', () => {
    const start = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const end = new Date(NOW.getTime() + 10 * 86400000).toISOString();
    const pace = computePace({ start_date: start, end_date: end }, 5, NOW);
    expect(pace!.expectedValue).toBe(0);
    // expectedValue <= 0 -> percentDelta falls back to 0 (the ">0" ternary's else branch).
    expect(pace!.percentDelta).toBe(0);
  });

  it('uses goal.current_value (with its own || 0 fallback) when the currentValue param is omitted', () => {
    const start = new Date(NOW.getTime() - 10 * 86400000).toISOString();
    const end = new Date(NOW.getTime() + 10 * 86400000).toISOString();
    const withValue = computePace({ start_date: start, end_date: end, target_value: 100, current_value: 48 }, undefined, NOW);
    expect(withValue!.onTrack).toBe(true);

    const withoutValue = computePace({ start_date: start, end_date: end, target_value: 100, current_value: undefined }, undefined, NOW);
    // No currentValue param AND no goal.current_value -> actualValue falls back to 0.
    expect(withoutValue!.onTrack).toBe(false);
  });

  it('defaults `now` to the current clock when omitted', () => {
    const start = new Date(Date.now() - 10 * 86400000).toISOString();
    const end = new Date(Date.now() + 10 * 86400000).toISOString();
    const pace = computePace({ start_date: start, end_date: end, target_value: 100, current_value: 50 }, 50);
    expect(pace).not.toBeNull();
    expect(pace!.daysElapsed).toBeGreaterThanOrEqual(9);
    expect(pace!.daysElapsed).toBeLessThanOrEqual(11);
  });
});
