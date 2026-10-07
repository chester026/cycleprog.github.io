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
