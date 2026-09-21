import { describe, it, expect } from 'vitest';
import {
  isRelevantToCycling,
  getGoalSkill,
  groupSubGoalsBySkill,
  getPaceBadge,
  averagePercent,
  filterRelevantSubGoals,
  getProgressStatusLabel,
  formatDate,
  formatScheduleDate,
} from './lib';

describe('isRelevantToCycling', () => {
  it('accepts cycling-flavoured text', () => {
    expect(isRelevantToCycling('Ride 300km per week')).toBe(true);
    expect(isRelevantToCycling('Prepare for Gran Fondo')).toBe(true);
  });

  it('rejects clearly unrelated text even if it contains a stray keyword', () => {
    expect(isRelevantToCycling('give me a recipe for пельмени')).toBe(false);
    expect(isRelevantToCycling('what is the weather today')).toBe(false);
  });

  it('rejects text with no cycling keyword at all', () => {
    expect(isRelevantToCycling('hello there')).toBe(false);
    expect(isRelevantToCycling('')).toBe(false);
  });
});

describe('getGoalSkill / groupSubGoalsBySkill', () => {
  it('prefers metric.skill when present', () => {
    expect(getGoalSkill({ metric: { skill: 'climbing' } })).toBe('climbing');
  });

  it('falls back to metric.field', () => {
    expect(getGoalSkill({ metric: { field: 'total_elevation_gain' } })).toBe('climbing');
    expect(getGoalSkill({ metric: { field: 'average_watts' } })).toBe('power');
  });

  it('treats a count-style distance-filtered goal as endurance', () => {
    expect(getGoalSkill({ metric: { source: 'activity', filter: { min_distance: 50000 } } })).toBe('endurance');
  });

  it('falls back to title keywords, then legacy goal_type, then other', () => {
    expect(getGoalSkill({ title: 'Climbing Interval Workouts' })).toBe('climbing');
    expect(getGoalSkill({ goal_type: 'avg_power' })).toBe('power');
    expect(getGoalSkill({ title: 'mystery goal', goal_type: 'unknown_type' })).toBe('other');
  });

  it('groups sub-goals by skill, in SKILL_GROUPS order, dropping empty groups', () => {
    const subGoals = [
      { id: 1, goal_type: 'avg_power' },
      { id: 2, goal_type: 'elevation' },
      { id: 3, goal_type: 'distance' },
    ];
    const groups = groupSubGoalsBySkill(subGoals);
    expect(groups.map((g) => g.key)).toEqual(['climbing', 'endurance', 'power']);
    expect(groups.find((g) => g.key === 'power').goals).toEqual([subGoals[0]]);
  });
});

describe('getPaceBadge', () => {
  it('returns null with no pace data', () => {
    expect(getPaceBadge({})).toBeNull();
  });

  it('reads onTrack/percentDelta off the server-computed pace object', () => {
    expect(getPaceBadge({ pace: { onTrack: true } })).toEqual({ label: 'On track', color: '#10b981' });
    expect(getPaceBadge({ pace: { onTrack: false, percentDelta: -5 } }).label).toBe('Behind schedule');
    expect(getPaceBadge({ pace: { onTrack: false, percentDelta: 5 } }).label).toBe('Ahead of schedule');
  });
});

describe('averagePercent / filterRelevantSubGoals', () => {
  it('averages the server percent field, not current_value/target_value', () => {
    // No current_value/target_value at all — proves this never recomputes.
    expect(averagePercent([{ percent: 40 }, { percent: 60 }])).toBe(50);
    expect(averagePercent([])).toBe(0);
  });

  it('excludes legacy ftp_vo2max sub-goals', () => {
    const subGoals = [{ id: 1, goal_type: 'distance' }, { id: 2, goal_type: 'ftp_vo2max' }];
    expect(filterRelevantSubGoals(subGoals)).toEqual([subGoals[0]]);
  });
});

describe('getProgressStatusLabel', () => {
  it('prioritizes a behind-schedule sub-goal over the percentage band', () => {
    const behind = [{ pace: { onTrack: false, percentDelta: -10 } }];
    expect(getProgressStatusLabel(90, behind)).toBe('Behind Schedule');
  });

  it('otherwise buckets by percentage', () => {
    expect(getProgressStatusLabel(100, [])).toBe('Goal Achieved');
    expect(getProgressStatusLabel(80, [])).toBe('Almost There');
    expect(getProgressStatusLabel(60, [])).toBe('Making Progress');
    expect(getProgressStatusLabel(30, [])).toBe('Building Momentum');
    expect(getProgressStatusLabel(0, [])).toBe('Just Getting Started');
  });
});


describe('formatDate / formatScheduleDate', () => {
  it('formats a date string, or a fallback with no input', () => {
    expect(formatDate(null)).toBe('No deadline');
    expect(formatDate('2026-03-15')).toBe('Mar 15, 2026');
  });

  it('parses a bare YYYY-MM-DD as local time, not UTC', () => {
    expect(formatScheduleDate('2026-03-15')).toBe('Sun, Mar 15');
  });

  it('returns the raw string for an unparseable date', () => {
    expect(formatScheduleDate('not-a-date')).toBe('not-a-date');
  });
});
