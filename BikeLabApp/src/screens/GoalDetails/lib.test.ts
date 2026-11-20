// lib.ts pulls in ../../utils/healthService for getHealthMetricValue, whose
// module top-level imports the native @kingstinct/react-native-healthkit
// module — unavailable under Jest (no native binary). None of the
// functions this test exercises actually call into it, so a bare mock is
// enough to satisfy the import graph.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

import type {Goal} from '@bikelab/shared/types';
import {
  getGoalTypeLabel,
  getGoalUnit,
  getPaceBadge,
  currentValueForGoal,
  percentageForGoal,
  computeOverallProgress,
  formatDate,
  formatScheduleDate,
  pickGoalPickerRides,
} from './lib';
import type {Activity} from '../../types/activity';
import {colors} from '../../theme';

// Fake `t` that returns the key itself (or the key + serialized options)
// so assertions can check exactly what was looked up, without a real
// i18next instance.
const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    goal_type: 'distance',
    target_value: 100,
    current_value: 50,
    ...overrides,
  } as Goal;
}

describe('getGoalTypeLabel / getGoalUnit', () => {
  it('translates a known legacy goal_type', () => {
    expect(getGoalTypeLabel('distance', t)).toBe('goalDetails.metricDistance');
    expect(getGoalUnit('distance', t)).toBe('common.km');
  });

  it('falls back to the raw goal_type / empty unit for an unknown one', () => {
    expect(getGoalTypeLabel('something_new', t)).toBe('something_new');
    expect(getGoalUnit('something_new', t)).toBe('');
  });
});

describe('getPaceBadge', () => {
  it('returns null when the goal has no pace (legacy sliding-window goal)', () => {
    expect(getPaceBadge(makeGoal({pace: undefined}), t)).toBeNull();
  });

  it('returns the on-track badge', () => {
    const goal = makeGoal({pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: true, percentDelta: 0}});
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceOnTrack', color: colors.success});
  });

  it('returns behind when off track and negative delta', () => {
    const goal = makeGoal({
      pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: false, percentDelta: -10},
    });
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceBehind', color: colors.danger});
  });

  it('returns ahead when off track and positive delta', () => {
    const goal = makeGoal({
      pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: false, percentDelta: 10},
    });
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceAhead', color: colors.success});
  });
});

describe('currentValueForGoal / percentageForGoal', () => {
  it('reads current_value as-is for a non-health source', () => {
    const goal = makeGoal({source: 'activity', current_value: 42});
    expect(currentValueForGoal(goal, undefined)).toBe(42);
  });

  it('reads the live health value for a health-source goal', () => {
    const goal = makeGoal({source: 'health', current_value: 0, metric: {source: 'health', health_metric: 'resting_hr'}});
    const healthContext = {resting_hr_bpm: 55} as any;
    expect(currentValueForGoal(goal, healthContext)).toBe(55);
  });

  it('caps percentage at 100 and never returns NaN/Infinity', () => {
    expect(percentageForGoal(makeGoal({target_value: 50, current_value: 100}), undefined)).toBe(100);
    expect(percentageForGoal(makeGoal({target_value: 0, current_value: 0}), undefined)).toBe(0);
  });
});

describe('computeOverallProgress', () => {
  it('averages percentages across sub-goals, excluding ftp_vo2max', () => {
    const subGoals = [
      makeGoal({id: 1, goal_type: 'distance', target_value: 100, current_value: 50}), // 50%
      makeGoal({id: 2, goal_type: 'elevation', target_value: 100, current_value: 100}), // 100%
      makeGoal({id: 3, goal_type: 'ftp_vo2max', target_value: 1, current_value: 0}), // excluded
    ];
    expect(computeOverallProgress(subGoals, undefined)).toBe(75);
  });

  it('returns 0 for no relevant sub-goals', () => {
    expect(computeOverallProgress([], undefined)).toBe(0);
    expect(computeOverallProgress([makeGoal({goal_type: 'ftp_vo2max'})], undefined)).toBe(0);
  });
});

describe('formatDate', () => {
  it('falls back to the no-deadline copy for a missing date', () => {
    expect(formatDate(undefined, 'en-US', t)).toBe('goalDetails.noDeadline');
  });

  it('formats a real date in the given locale', () => {
    expect(formatDate('2026-06-15', 'en-US', t)).toBe('Jun 15, 2026');
  });
});

describe('formatScheduleDate', () => {
  it('parses a bare YYYY-MM-DD as local time, not UTC (no day-shift west of UTC)', () => {
    // Monday 2026-06-15 parsed at local midnight must format back as the
    // same calendar day regardless of the running machine's timezone.
    expect(formatScheduleDate('2026-06-15', 'en-US')).toBe('Mon, Jun 15');
  });

  it('returns the raw string for an unparseable date', () => {
    expect(formatScheduleDate('not-a-date', 'en-US')).toBe('not-a-date');
  });
});

describe('pickGoalPickerRides', () => {
  let nextId = 1;
  const act = (start_date: string, km: number, type = 'Ride'): Activity => ({
    id: nextId++,
    name: `ride ${nextId}`,
    type,
    start_date,
    distance: km * 1000,
    moving_time: 3600,
    elapsed_time: 3600,
    total_elevation_gain: 0,
    average_speed: 7,
    max_speed: 10,
  });
  const created = '2026-09-10T15:00:00';

  it('keeps cycling rides since the created day, newest first, and preselects the longest', () => {
    const rides = [
      act('2026-09-12T08:00:00', 40),
      act('2026-09-10T07:00:00', 90), // created later that day: still in the window
      act('2026-09-20T08:00:00', 60),
      act('2026-09-15T08:00:00', 10, 'Run'),
      act('2026-09-01T08:00:00', 200), // before the goal
    ];
    const r = pickGoalPickerRides(rides, created);
    expect(r.windowRides.map(a => a.distance / 1000)).toEqual([60, 40, 90]);
    expect(r.preselectedIds).toEqual([rides[1].id]);
    expect(r.earlierRides).toEqual([]); // 3 rides in the window is enough
  });

  it('offers earlier rides only when the window has fewer than 3, at most 10 and none from the window', () => {
    const old = Array.from({length: 12}, (_, i) => act(`2026-08-${String(i + 1).padStart(2, '0')}T08:00:00`, 30 + i));
    const inWindow = [act('2026-09-11T08:00:00', 50), act('2026-09-12T08:00:00', 20)];
    const few = pickGoalPickerRides([...old, ...inWindow], created);
    expect(few.windowRides).toHaveLength(2);
    expect(few.earlierRides).toHaveLength(10);
    expect(few.earlierRides[0].start_date).toBe('2026-08-12T08:00:00');

    const enough = pickGoalPickerRides([...old, ...inWindow, act('2026-09-13T08:00:00', 70)], created);
    expect(enough.earlierRides).toEqual([]);
  });

  it('has nothing preselected when there are no rides in the window', () => {
    expect(pickGoalPickerRides([act('2026-08-01T08:00:00', 30)], created).preselectedIds).toEqual([]);
    expect(pickGoalPickerRides(undefined, created)).toEqual({windowRides: [], earlierRides: [], preselectedIds: []});
  });
});
