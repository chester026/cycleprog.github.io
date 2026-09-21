// lib.ts pulls in ../../utils/healthService for getHealthMetricValue, whose
// module top-level imports the native @kingstinct/react-native-healthkit
// module — unavailable under Jest (no native binary). None of the
// functions this test exercises actually call into it, so a bare mock is
// enough to satisfy the import graph.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

import type {Goal, MetaGoal, TrainingType} from '@bikelab/shared/types';
import {
  SCHEDULE_TYPE_COLORS,
  getScheduleTypeColor,
  getGoalTypeLabel,
  getGoalUnit,
  getPaceBadge,
  currentValueForGoal,
  percentageForGoal,
  computeOverallProgress,
  formatDate,
  formatScheduleDate,
  groupTrainings,
} from './lib';

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

function makeMetaGoal(overrides: Partial<MetaGoal> = {}): MetaGoal {
  return {
    id: 1,
    title: 'Ride 1000km',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as MetaGoal;
}

describe('getScheduleTypeColor', () => {
  it('returns the mapped color for a known type', () => {
    expect(getScheduleTypeColor('rest_day')).toBe(SCHEDULE_TYPE_COLORS.rest_day);
  });

  it('falls back to planned_ride for an unknown type', () => {
    expect(getScheduleTypeColor('something_else')).toBe(SCHEDULE_TYPE_COLORS.planned_ride);
  });
});

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
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceOnTrack', color: '#10b981'});
  });

  it('returns behind when off track and negative delta', () => {
    const goal = makeGoal({
      pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: false, percentDelta: -10},
    });
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceBehind', color: '#ef4444'});
  });

  it('returns ahead when off track and positive delta', () => {
    const goal = makeGoal({
      pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: false, percentDelta: 10},
    });
    expect(getPaceBadge(goal, t)).toEqual({label: 'goalDetails.paceAhead', color: '#10b981'});
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

describe('groupTrainings', () => {
  const trainingTypes: TrainingType[] = [
    {key: 'endurance', name: 'Endurance', intensity: '60-70%', duration: '90 min', benefits: ['Builds base']},
  ];

  it('returns empty groups when the meta-goal has no AI trainingTypes', () => {
    expect(groupTrainings(makeMetaGoal(), [])).toEqual({mostRecommended: null, priority: [], all: []});
  });

  it('sorts by priority, enriches from the library, and splits mostRecommended/priority', () => {
    const metaGoal = makeMetaGoal({
      trainingTypes: [
        {type: 'endurance', title: 'Long Ride', description: 'Build endurance', priority: 2},
        {type: 'unknown_type', title: 'Mystery', description: 'No library match', priority: 1},
      ],
    });

    const grouped = groupTrainings(metaGoal, trainingTypes);

    expect(grouped.mostRecommended?.name).toBe('Mystery'); // priority 1 sorts first
    expect(grouped.mostRecommended?.details).toEqual({intensity: 'Variable', duration: '60-90 min'});
    expect(grouped.priority).toHaveLength(1);
    expect(grouped.priority[0].name).toBe('Long Ride');
    expect(grouped.priority[0].trainingType).toBe('endurance');
    expect(grouped.priority[0].details?.intensity).toBe('60-70%');
    expect(grouped.priority[0].details?.benefits).toEqual(['Builds base']);
    expect(grouped.all).toHaveLength(2);
  });

  it('flattens an object-shaped structure into warmup/main/cooldown lines', () => {
    const metaGoal = makeMetaGoal({
      trainingTypes: [{type: 'endurance', title: 'Long Ride', description: 'x', priority: 1}],
    });
    const types: TrainingType[] = [
      {
        key: 'endurance',
        name: 'Endurance',
        structure: {warmup: '10 min easy', main: '60 min steady', cooldown: '10 min easy'} as any,
      },
    ];

    const grouped = groupTrainings(metaGoal, types);

    expect(grouped.mostRecommended?.details?.structure).toEqual([
      'Warmup: 10 min easy',
      'Main: 60 min steady',
      'Cooldown: 10 min easy',
    ]);
  });
});
