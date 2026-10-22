import { describe, it, expect } from 'vitest';
import {
  parseCalendarSearch,
  calendarSearch,
  formValuesFor,
  bodyFromValues,
  formatMonthLabel,
  formatDayHeader,
  formatLongDate,
  formatWeekLabel,
} from './lib';
import { askCoachPrompt, eventColor, eventTypeLabel } from './copy';

const now = new Date(2026, 9, 16); // 2026-10-16

describe('parseCalendarSearch', () => {
  it('reads date, goal and view', () => {
    const state = parseCalendarSearch(new URLSearchParams('date=2026-06-15&goal=7&view=week'), now);
    expect(state).toEqual({ date: '2026-06-15', goalId: '7', view: 'week' });
  });

  it('falls back to today / no goal / month for missing or invalid values', () => {
    expect(parseCalendarSearch(new URLSearchParams(''), now)).toEqual({ date: '2026-10-16', goalId: null, view: 'month' });
    expect(parseCalendarSearch(new URLSearchParams('date=2026-02-30&goal=abc&view=year'), now)).toEqual({
      date: '2026-10-16',
      goalId: null,
      view: 'month',
    });
  });

  it('round-trips through calendarSearch, omitting defaults', () => {
    expect(calendarSearch({ date: '2026-06-15', goalId: null, view: 'month' }).toString()).toBe('date=2026-06-15');
    expect(calendarSearch({ date: '2026-06-15', goalId: '7', view: 'week' }).toString()).toBe('date=2026-06-15&goal=7&view=week');
  });
});

describe('form values ↔ body', () => {
  it('starts blank for a new event on the date', () => {
    expect(formValuesFor('2026-06-15', null)).toEqual({
      type: 'planned_ride',
      title: '',
      date: '2026-06-15',
      startTime: '',
      duration: '',
      location: '',
      description: '',
      goalId: '',
    });
  });

  it('derives the duration from start/end times of an existing event', () => {
    const values = formValuesFor('x', {
      type: 'event',
      title: 'Gran Fondo',
      start_date: '2026-06-20',
      start_time: '09:00:00',
      end_time: '12:30:00',
      location: 'Riva',
      description: null,
      goal_id: 3,
    });
    expect(values).toMatchObject({ type: 'event', date: '2026-06-20', startTime: '09:00', duration: '210', location: 'Riva', description: '', goalId: '3' });
  });

  it('builds an all-day body without times and a timed body with end_time', () => {
    expect(bodyFromValues({ ...formValuesFor('2026-06-15', null), title: '  Rest  ', type: 'rest_day' })).toEqual({
      type: 'rest_day',
      title: 'Rest',
      start_date: '2026-06-15',
      start_time: null,
      end_time: null,
      all_day: true,
      location: null,
      description: null,
      goal_id: null,
    });
    expect(
      bodyFromValues({ ...formValuesFor('2026-06-15', null), title: 'Intervals', startTime: '18:00', duration: '75', goalId: '4', location: 'Park ' }),
    ).toMatchObject({ start_time: '18:00', end_time: '19:15', all_day: false, goal_id: 4, location: 'Park' });
  });
});

describe('formatting', () => {
  it('month, day and long date labels', () => {
    expect(formatMonthLabel('2026-06-15')).toBe('June 2026');
    expect(formatDayHeader('2026-06-15')).toBe('Mon, Jun 15');
    expect(formatLongDate('2026-06-15')).toBe('Monday, June 15, 2026');
  });

  it('week labels across month and year boundaries', () => {
    expect(formatWeekLabel({ from: '2026-06-15', to: '2026-06-21' })).toBe('Jun 15 – 21, 2026');
    expect(formatWeekLabel({ from: '2026-06-29', to: '2026-07-05' })).toBe('Jun 29 – Jul 5, 2026');
    expect(formatWeekLabel({ from: '2026-12-28', to: '2027-01-03' })).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('copy', () => {
  it('interpolates the per-type coach prompts and falls back to planned ride', () => {
    const ctx = { title: 'Climb', date: 'Mon, Jun 15' };
    expect(askCoachPrompt('planned_ride', ctx)).toBe('Tell me more about my planned ride "Climb" on Mon, Jun 15 — what should I focus on?');
    expect(askCoachPrompt('rest_day', ctx)).toBe('Any tips for making the most of my rest day on Mon, Jun 15?');
    expect(askCoachPrompt('note', ctx)).toBe('Can you expand on this note: "Climb"?');
    expect(askCoachPrompt('unknown', ctx)).toBe(askCoachPrompt('planned_ride', ctx));
  });

  it('maps every type to a colour and label, with planned ride as fallback', () => {
    expect(eventColor('maintenance')).toBe('#f59e0b');
    expect(eventColor('nope')).toBe('#274dd3');
    expect(eventTypeLabel('rest_day')).toBe('Rest Day');
    expect(eventTypeLabel('nope')).toBe('Planned Ride');
  });
});
