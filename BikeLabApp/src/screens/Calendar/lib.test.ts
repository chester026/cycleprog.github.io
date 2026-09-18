import {
  fmtDate,
  startOfMonth,
  addMonths,
  endOfMonth,
  addDays,
  startOfWeek,
  parseDateOnly,
  formatDayHeader,
  isToday,
  formatKm,
  formatDuration,
  formatEventDuration,
  groupByDay,
  weekStripDaysFor,
  datesWithContentFrom,
} from './lib';
import type {CalendarEvent} from '@bikelab/shared/types';
import type {Activity} from '../../types/activity';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    type: 'planned_ride',
    title: 'Long ride',
    start_date: '2026-06-15',
    source: 'user',
    ...overrides,
  } as CalendarEvent;
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    name: 'Morning ride',
    type: 'Ride',
    start_date: '2026-06-15T08:00:00Z',
    distance: 20000,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 100,
    average_speed: 5.5,
    max_speed: 10,
    ...overrides,
  } as Activity;
}

describe('fmtDate', () => {
  it('formats a local date as YYYY-MM-DD without UTC conversion', () => {
    // 2026-01-01 00:30 local — if this went through toISOString() first, a
    // timezone west of UTC would push it back to 2025-12-31.
    const d = new Date(2026, 0, 1, 0, 30);
    expect(fmtDate(d)).toBe('2026-01-01');
  });

  it('pads single-digit month and day', () => {
    expect(fmtDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('startOfMonth / endOfMonth / addMonths', () => {
  it('startOfMonth returns the 1st', () => {
    expect(fmtDate(startOfMonth(new Date(2026, 5, 15)))).toBe('2026-06-01');
  });

  it('endOfMonth returns the last day, including leap February', () => {
    expect(fmtDate(endOfMonth(new Date(2026, 5, 15)))).toBe('2026-06-30');
    expect(fmtDate(endOfMonth(new Date(2024, 1, 10)))).toBe('2024-02-29'); // leap year
    expect(fmtDate(endOfMonth(new Date(2026, 1, 10)))).toBe('2026-02-28'); // non-leap
  });

  it('addMonths rolls the year over at the boundary', () => {
    expect(fmtDate(addMonths(new Date(2026, 11, 5), 1))).toBe('2027-01-05');
    expect(fmtDate(addMonths(new Date(2026, 0, 5), -1))).toBe('2025-12-05');
  });
});

describe('addDays', () => {
  it('adds days without mutating the input', () => {
    const original = new Date(2026, 5, 30);
    const result = addDays(original, 3);
    expect(fmtDate(original)).toBe('2026-06-30');
    expect(fmtDate(result)).toBe('2026-07-03');
  });
});

describe('startOfWeek', () => {
  it('returns the same Monday for every day in that Mon..Sun week', () => {
    // 2026-06-15 is a Monday.
    const monday = new Date(2026, 5, 15);
    for (let i = 0; i < 7; i++) {
      expect(fmtDate(startOfWeek(addDays(monday, i)))).toBe('2026-06-15');
    }
  });

  it('treats Sunday as the end of the previous week, not the start of a new one', () => {
    // 2026-06-21 is a Sunday, belonging to the week starting 2026-06-15.
    expect(fmtDate(startOfWeek(new Date(2026, 5, 21)))).toBe('2026-06-15');
  });
});

describe('parseDateOnly', () => {
  it('parses as local midnight, not UTC', () => {
    const d = parseDateOnly('2026-06-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });
});

describe('formatDayHeader', () => {
  it('formats a date-only string as weekday, day and month, in local time', () => {
    // 2026-06-15 is a Monday.
    expect(formatDayHeader('2026-06-15', 'en-US')).toBe('Mon, Jun 15');
  });
});

describe('isToday', () => {
  it('matches only today\'s local date string', () => {
    expect(isToday(fmtDate(new Date()))).toBe(true);
    expect(isToday('2000-01-01')).toBe(false);
  });
});

describe('formatKm / formatDuration', () => {
  it('formatKm converts meters to a 1-decimal km string', () => {
    expect(formatKm(20500)).toBe('20.5');
    expect(formatKm(0)).toBe('0.0');
  });

  it('formatDuration renders under an hour as "Nmin"', () => {
    expect(formatDuration(1500)).toBe('25min');
  });

  it('formatDuration renders an hour+ as "H:MM"', () => {
    expect(formatDuration(3725)).toBe('1:02');
    expect(formatDuration(7200)).toBe('2:00');
  });
});

describe('formatEventDuration', () => {
  it('returns null when either time is missing', () => {
    expect(formatEventDuration(null, '10:00')).toBeNull();
    expect(formatEventDuration('09:00', undefined)).toBeNull();
  });

  it('returns null for a non-positive diff', () => {
    expect(formatEventDuration('10:00', '09:00')).toBeNull();
    expect(formatEventDuration('09:00', '09:00')).toBeNull();
  });

  it('renders under an hour as "~N min"', () => {
    expect(formatEventDuration('09:00', '09:45')).toBe('~45 min');
  });

  it('renders exactly on the hour without a minutes part', () => {
    expect(formatEventDuration('09:00', '11:00')).toBe('~2h');
  });

  it('renders a mixed hour+minutes duration', () => {
    expect(formatEventDuration('09:00', '10:30')).toBe('~1h 30min');
  });
});

describe('groupByDay', () => {
  const from = startOfMonth(new Date(2026, 5, 1));
  const to = endOfMonth(new Date(2026, 5, 1));

  it('buckets activities and events onto the same date', () => {
    const activities = [makeActivity({start_date: '2026-06-15T08:00:00Z'})];
    const events = [makeEvent({start_date: '2026-06-15'})];
    const days = groupByDay(activities, events, from, to);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-06-15');
    expect(days[0].activities).toHaveLength(1);
    expect(days[0].events).toHaveLength(1);
  });

  it('excludes items outside [from, to] (no cross-month leakage)', () => {
    const activities = [
      makeActivity({id: 1, start_date: '2026-05-31T08:00:00Z'}),
      makeActivity({id: 2, start_date: '2026-06-15T08:00:00Z'}),
      makeActivity({id: 3, start_date: '2026-07-01T08:00:00Z'}),
    ];
    const days = groupByDay(activities, [], from, to);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-06-15');
  });

  it('skips items with no start_date', () => {
    const activities = [makeActivity({start_date: undefined as unknown as string})];
    expect(groupByDay(activities, [], from, to)).toHaveLength(0);
  });

  it('sorts groups ascending by date', () => {
    const events = [makeEvent({id: 1, start_date: '2026-06-20'}), makeEvent({id: 2, start_date: '2026-06-05'})];
    const days = groupByDay([], events, from, to);
    expect(days.map(d => d.date)).toEqual(['2026-06-05', '2026-06-20']);
  });
});

describe('weekStripDaysFor', () => {
  it('returns the 7 Mon..Sun dates around the selected date', () => {
    const days = weekStripDaysFor('2026-06-17'); // a Wednesday
    expect(days).toHaveLength(7);
    expect(fmtDate(days[0])).toBe('2026-06-15'); // Monday
    expect(fmtDate(days[6])).toBe('2026-06-21'); // Sunday
  });
});

describe('datesWithContentFrom', () => {
  it('includes only dates with at least one activity or event', () => {
    const days = [
      {date: '2026-06-01', activities: [makeActivity()], events: []},
      {date: '2026-06-02', activities: [], events: []},
      {date: '2026-06-03', activities: [], events: [makeEvent()]},
    ];
    expect(datesWithContentFrom(days)).toEqual(new Set(['2026-06-01', '2026-06-03']));
  });
});
