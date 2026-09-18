import { describe, it, expect } from 'vitest';
import {
  getDayName,
  getFullDayName,
  getAllTrainings,
  sortTrainingsByPriority,
  getWeekNumber,
  rotatePriorityWorkouts,
  getCompositeDescription,
  getDayTraining,
  groupTrainings,
} from './lib';

describe('getDayName / getFullDayName', () => {
  it('abbreviates and expands known day keys', () => {
    expect(getDayName('monday')).toBe('Mon');
    expect(getFullDayName('monday')).toBe('Monday');
  });

  it('falls back to the key itself for an unknown day', () => {
    expect(getDayName('someday')).toBe('someday');
    expect(getFullDayName('someday')).toBe('someday');
  });
});

describe('getAllTrainings', () => {
  it('returns [] when there is no plan', () => {
    expect(getAllTrainings(null)).toEqual([]);
    expect(getAllTrainings({})).toEqual([]);
  });

  it('skips rest days and tags each training with its day key', () => {
    const weeklyPlan = {
      plan: {
        monday: { type: 'endurance', trainingType: 'endurance' },
        tuesday: { type: 'rest' },
        wednesday: { type: 'tempo', trainingType: 'tempo' },
      },
    };
    const result = getAllTrainings(weeklyPlan);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ day: 'monday', type: 'endurance' });
    expect(result[1]).toMatchObject({ day: 'wednesday', type: 'tempo' });
  });
});

describe('sortTrainingsByPriority', () => {
  it('ranks trainings by their index in weeklyPlan.priorities, highest first', () => {
    const weeklyPlan = {
      priorities: ['sprint', 'endurance', 'tempo'],
      plan: {
        monday: { type: 'endurance', trainingType: 'endurance' },
        tuesday: { type: 'tempo', trainingType: 'tempo' },
        wednesday: { type: 'sprint', trainingType: 'sprint' },
      },
    };
    const result = sortTrainingsByPriority(weeklyPlan);
    expect(result.map((t) => t.trainingType)).toEqual(['sprint', 'endurance', 'tempo']);
  });

  it('scores a training absent from priorities as 0', () => {
    const weeklyPlan = {
      priorities: ['endurance'],
      plan: {
        monday: { type: 'endurance', trainingType: 'endurance' },
        tuesday: { type: 'unknown_type', trainingType: 'unknown_type' },
      },
    };
    const result = sortTrainingsByPriority(weeklyPlan);
    expect(result[0].trainingType).toBe('endurance');
    expect(result[1].priorityScore).toBe(0);
  });
});

describe('getWeekNumber', () => {
  it('is 0 for the first week of the year and cycles mod 3', () => {
    expect(getWeekNumber(new Date(2026, 0, 3))).toBe(0);
    expect(getWeekNumber(new Date(2026, 0, 10))).toBe(1);
    expect(getWeekNumber(new Date(2026, 0, 17))).toBe(2);
    expect(getWeekNumber(new Date(2026, 0, 24))).toBe(0);
  });
});

describe('rotatePriorityWorkouts', () => {
  const four = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('leaves fewer than 4 trainings untouched', () => {
    const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(rotatePriorityWorkouts(three, 1)).toBe(three);
  });

  it('leaves week variation 0 in original order', () => {
    expect(rotatePriorityWorkouts(four, 0).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('swaps the first two for week variation 1', () => {
    expect(rotatePriorityWorkouts(four, 1).map((t) => t.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('cycles the last to the front for week variation 2', () => {
    expect(rotatePriorityWorkouts(four, 2).map((t) => t.id)).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('getCompositeDescription', () => {
  const trainingTypes = [
    { key: 'endurance', name: 'Endurance' },
    { key: 'tempo', name: 'Tempo' },
  ];

  it('returns "" for no parts', () => {
    expect(getCompositeDescription([], trainingTypes)).toBe('');
    expect(getCompositeDescription(null, trainingTypes)).toBe('');
  });

  it('sums durations and joins unique type names', () => {
    const parts = [
      { type: 'endurance', duration: '60' },
      { type: 'tempo', duration: '30' },
      { type: 'endurance', duration: '10' },
    ];
    expect(getCompositeDescription(parts, trainingTypes)).toBe('100 min • Endurance + Tempo');
  });
});

describe('getDayTraining', () => {
  const weeklyPlan = {
    plan: { monday: { type: 'endurance' } },
    customPlan: { tuesday: { type: 'custom-tue' } },
  };

  it('generated mode: custom plan overrides the generated plan for that day', () => {
    const customPlan = { monday: { type: 'custom-mon' } };
    expect(getDayTraining({ viewMode: 'generated', dayKey: 'monday', customPlan, weeklyPlan })).toEqual({
      type: 'custom-mon',
    });
  });

  it('generated mode: falls back to the generated plan when no custom day exists', () => {
    expect(getDayTraining({ viewMode: 'generated', dayKey: 'monday', customPlan: {}, weeklyPlan })).toEqual({
      type: 'endurance',
    });
  });

  it('manual mode: only ever returns customs, never the generated plan', () => {
    expect(getDayTraining({ viewMode: 'manual', dayKey: 'monday', customPlan: {}, weeklyPlan })).toBeUndefined();
    expect(
      getDayTraining({ viewMode: 'manual', dayKey: 'tuesday', customPlan: {}, weeklyPlan })
    ).toEqual({ type: 'custom-tue' });
  });
});

describe('groupTrainings', () => {
  it('AI-generated mode resolves each entry against the training-type library', () => {
    const metaGoal = {
      trainingTypes: [
        { type: 'sprint', priority: 2, title: 'Sprints', description: 'Go fast' },
        { type: 'endurance', priority: 1, title: 'Long ride', description: 'Go far' },
      ],
    };
    const trainingTypes = [{ key: 'endurance', intensity: '65-75% FTP', duration: '90 min' }];

    const grouped = groupTrainings({ mode: 'ai-generated', metaGoal, trainingTypes, weeklyPlan: null });

    expect(grouped.mostRecommended).toMatchObject({ name: 'Long ride', trainingType: 'endurance' });
    expect(grouped.mostRecommended.details).toEqual({ intensity: '65-75% FTP', duration: '90 min' });
    expect(grouped.all).toHaveLength(2);
    // Not in the library: falls back to a generic detail placeholder.
    expect(grouped.all[1]).toMatchObject({ trainingType: 'sprint', details: { intensity: 'Variable', duration: '60-90 min' } });
  });

  it('default mode groups and rotates the generated weekly plan', () => {
    const weeklyPlan = {
      priorities: ['a', 'b', 'c', 'd'],
      plan: {
        monday: { type: 'a', trainingType: 'a' },
        tuesday: { type: 'b', trainingType: 'b' },
        wednesday: { type: 'c', trainingType: 'c' },
        thursday: { type: 'd', trainingType: 'd' },
      },
    };
    const grouped = groupTrainings({ mode: null, metaGoal: null, trainingTypes: [], weeklyPlan, now: new Date(2026, 0, 3) });
    expect(grouped.mostRecommended.trainingType).toBe('a');
    expect(grouped.priority.map((t) => t.trainingType)).toEqual(['b', 'c', 'd']);
    expect(grouped.all).toHaveLength(4);
  });
});
