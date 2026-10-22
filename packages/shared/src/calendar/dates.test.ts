import { describe, it, expect } from 'vitest';
import {
  fmtDate,
  parseDateOnly,
  isValidDateString,
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  addDaysStr,
  startOfWeek,
  weekRange,
  weekDays,
  monthMatrix,
  monthGridRange,
  sameDayNextMonth,
  weekPageTarget,
  rangesOverlap,
  startDay,
  eventDays,
  groupByDay,
  datesWithContent,
  timeToMinutes,
  minutesToTime,
  eventDurationMinutes,
  formatEventDuration,
  timesFromStartAndDuration,
  formatKm,
  formatActivityDuration,
} from './dates.js';

const JUNE = { from: '2026-06-01', to: '2026-06-30' };

describe('fmtDate / parseDateOnly / isValidDateString', () => {
  it('formats a local date without UTC conversion and pads month/day', () => {
    expect(fmtDate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(fmtDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('parses as local midnight', () => {
    const d = parseDateOnly('2026-06-15');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 5, 15, 0]);
  });

  it('accepts only real YYYY-MM-DD days', () => {
    expect(isValidDateString('2026-06-15')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false); // rolls over → mismatch
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('15-06-2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(20260615)).toBe(false);
  });
});

describe('month and day arithmetic', () => {
  it('startOfMonth / endOfMonth, including leap February', () => {
    expect(fmtDate(startOfMonth(new Date(2026, 5, 15)))).toBe('2026-06-01');
    expect(fmtDate(endOfMonth(new Date(2026, 5, 15)))).toBe('2026-06-30');
    expect(fmtDate(endOfMonth(new Date(2024, 1, 10)))).toBe('2024-02-29');
    expect(fmtDate(endOfMonth(new Date(2026, 1, 10)))).toBe('2026-02-28');
  });

  it('addMonths anchors on the 1st and rolls the year', () => {
    expect(fmtDate(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    expect(fmtDate(addMonths(new Date(2026, 11, 5), 1))).toBe('2027-01-01');
    expect(fmtDate(addMonths(new Date(2026, 0, 5), -1))).toBe('2025-12-01');
  });

  it('addDays does not mutate; addDaysStr crosses month ends', () => {
    const original = new Date(2026, 5, 30);
    expect(fmtDate(addDays(original, 3))).toBe('2026-07-03');
    expect(fmtDate(original)).toBe('2026-06-30');
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('sameDayNextMonth clamps to the shorter month', () => {
    expect(sameDayNextMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(sameDayNextMonth('2026-03-15', -1)).toBe('2026-02-15');
    expect(sameDayNextMonth('2026-12-10', 1)).toBe('2027-01-10');
  });
});

describe('weeks (Monday start)', () => {
  it('startOfWeek returns the same Monday for every day of the week, Sunday included', () => {
    const monday = new Date(2026, 5, 15);
    for (let i = 0; i < 7; i++) {
      expect(fmtDate(startOfWeek(addDays(monday, i)))).toBe('2026-06-15');
    }
    expect(fmtDate(startOfWeek(new Date(2026, 5, 21)))).toBe('2026-06-15');
  });

  it('weekRange and weekDays cover Mon..Sun around the date', () => {
    expect(weekRange('2026-06-17')).toEqual({ from: '2026-06-15', to: '2026-06-21' });
    const days = weekDays('2026-06-17');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-06-15');
    expect(days[6]).toBe('2026-06-21');
  });

  it('weekPageTarget keeps the weekday, except when the target week holds today', () => {
    const now = new Date(2026, 5, 17); // Wed
    expect(weekPageTarget('2026-06-02', 1, now)).toBe('2026-06-09');
    expect(weekPageTarget('2026-06-09', 1, now)).toBe('2026-06-17'); // lands in today's week → today
    expect(weekPageTarget('2026-06-23', -1, now)).toBe('2026-06-17');
    expect(weekPageTarget('2026-06-23', 1, now)).toBe('2026-06-30');
  });
});

describe('monthMatrix / monthGridRange', () => {
  it('pads to full Mon..Sun rows and marks out-of-month cells', () => {
    // June 2026 starts on a Monday and ends on a Tuesday → 5 rows.
    const rows = monthMatrix('2026-06-15');
    expect(rows).toHaveLength(5);
    expect(rows[0][0]).toEqual({ date: '2026-06-01', inMonth: true });
    expect(rows[4][1]).toEqual({ date: '2026-06-30', inMonth: true });
    expect(rows[4][2]).toEqual({ date: '2026-07-01', inMonth: false });
    expect(rows[4][6].date).toBe('2026-07-05');
    rows.forEach((row) => expect(row).toHaveLength(7));
  });

  it('handles a month starting mid-week and a 6-row month', () => {
    // March 2026 starts on a Sunday → 6 leading February days.
    const march = monthMatrix('2026-03-10');
    expect(march[0].slice(0, 6).every((c) => !c.inMonth && c.date.startsWith('2026-02'))).toBe(true);
    expect(march[0][6]).toEqual({ date: '2026-03-01', inMonth: true });
    expect(march).toHaveLength(6);
    // February 2027 starts on a Monday and has 28 days → exactly 4 rows.
    expect(monthMatrix('2027-02-01')).toHaveLength(4);
  });

  it('monthGridRange spans the first to the last padded cell', () => {
    expect(monthGridRange('2026-06-15')).toEqual({ from: '2026-06-01', to: '2026-07-05' });
    expect(monthGridRange('2026-03-10')).toEqual({ from: '2026-02-23', to: '2026-04-05' });
  });
});

describe('rangesOverlap', () => {
  it('is inclusive at both ends', () => {
    expect(rangesOverlap(JUNE, { from: '2026-06-30', to: '2026-07-10' })).toBe(true);
    expect(rangesOverlap(JUNE, { from: '2026-05-01', to: '2026-06-01' })).toBe(true);
    expect(rangesOverlap(JUNE, { from: '2026-07-01', to: '2026-07-10' })).toBe(false);
    expect(rangesOverlap({ from: '2026-05-01', to: '2026-05-31' }, JUNE)).toBe(false);
  });
});

describe('startDay / eventDays', () => {
  it('prefers the local start day and falls back to the UTC one', () => {
    expect(startDay({ start_date: '2026-06-15T23:30:00Z', start_date_local: '2026-06-16T01:30:00Z' })).toBe(
      '2026-06-16',
    );
    expect(startDay({ start_date: '2026-06-15T23:30:00Z' })).toBe('2026-06-15');
    expect(startDay({ start_date: '2026-06-15' })).toBe('2026-06-15');
    expect(startDay({})).toBeNull();
    expect(startDay({ start_date: null })).toBeNull();
  });

  it('expands a multi-day event and clips it to the range', () => {
    expect(eventDays({ start_date: '2026-06-29', end_date: '2026-07-02' }, JUNE)).toEqual([
      '2026-06-29',
      '2026-06-30',
    ]);
    expect(eventDays({ start_date: '2026-05-30', end_date: '2026-06-02' }, JUNE)).toEqual([
      '2026-06-01',
      '2026-06-02',
    ]);
  });

  it('treats a missing or earlier end_date as a single day', () => {
    expect(eventDays({ start_date: '2026-06-15' }, JUNE)).toEqual(['2026-06-15']);
    expect(eventDays({ start_date: '2026-06-15', end_date: null }, JUNE)).toEqual(['2026-06-15']);
    expect(eventDays({ start_date: '2026-06-15', end_date: '2026-06-10' }, JUNE)).toEqual(['2026-06-15']);
  });

  it('returns nothing for an event without a start or outside the range', () => {
    expect(eventDays({}, JUNE)).toEqual([]);
    expect(eventDays({ start_date: '2026-07-15' }, JUNE)).toEqual([]);
  });
});

describe('groupByDay / datesWithContent', () => {
  const activity = (id: number, start_date: string) => ({ id, start_date });
  const event = (id: number, start_date: string, end_date?: string) => ({ id, start_date, end_date });

  it('buckets activities and events onto the same date, sorted ascending', () => {
    const days = groupByDay(
      [activity(1, '2026-06-20T08:00:00Z'), activity(2, '2026-06-05T08:00:00Z')],
      [event(1, '2026-06-20'), event(2, '2026-06-05')],
      JUNE,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-06-05', '2026-06-20']);
    expect(days[1].activities.map((a) => a.id)).toEqual([1]);
    expect(days[1].events.map((e) => e.id)).toEqual([1]);
  });

  it('excludes items outside the range and items without a date', () => {
    const days = groupByDay(
      [activity(1, '2026-05-31T08:00:00Z'), activity(2, '2026-06-15T08:00:00Z'), { id: 3 }],
      [event(9, '2026-07-01')],
      JUNE,
    );
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-06-15');
    expect(days[0].events).toEqual([]);
  });

  it('repeats a multi-day event on each day it spans', () => {
    const days = groupByDay([], [event(1, '2026-06-10', '2026-06-12')], JUNE);
    expect(days.map((d) => d.date)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('datesWithContent lists only dates that have something', () => {
    const set = datesWithContent([
      { date: '2026-06-01', activities: [1], events: [] },
      { date: '2026-06-02', activities: [], events: [] },
      { date: '2026-06-03', activities: [], events: [1] },
    ]);
    expect([...set]).toEqual(['2026-06-01', '2026-06-03']);
  });
});

describe('times and durations', () => {
  it('timeToMinutes parses HH:MM and HH:MM:SS, rejecting junk and out-of-range values', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('9:05:00')).toBe(545);
    expect(timeToMinutes('24:00')).toBeNull();
    expect(timeToMinutes('10:60')).toBeNull();
    expect(timeToMinutes('noon')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes(undefined)).toBeNull();
  });

  it('minutesToTime pads and wraps around midnight', () => {
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(1500)).toBe('01:00');
    expect(minutesToTime(-30)).toBe('23:30');
  });

  it('eventDurationMinutes needs both times and a positive span', () => {
    expect(eventDurationMinutes('09:00', '10:30')).toBe(90);
    expect(eventDurationMinutes(null, '10:00')).toBeNull();
    expect(eventDurationMinutes('09:00', undefined)).toBeNull();
    expect(eventDurationMinutes('10:00', '09:00')).toBeNull();
    expect(eventDurationMinutes('09:00', '09:00')).toBeNull();
  });

  it('formatEventDuration renders minutes, whole hours and mixed', () => {
    expect(formatEventDuration('09:00', '09:45')).toBe('~45 min');
    expect(formatEventDuration('09:00', '11:00')).toBe('~2h');
    expect(formatEventDuration('09:00', '10:30')).toBe('~1h 30min');
    expect(formatEventDuration('10:00', '09:00')).toBeNull();
  });

  it('timesFromStartAndDuration is the inverse of eventDurationMinutes', () => {
    expect(timesFromStartAndDuration('09:00', 90)).toEqual({ start_time: '09:00', end_time: '10:30' });
    expect(timesFromStartAndDuration('9:00', null)).toEqual({ start_time: '09:00', end_time: null });
    expect(timesFromStartAndDuration('09:00', 0)).toEqual({ start_time: '09:00', end_time: null });
    expect(timesFromStartAndDuration(null, 60)).toEqual({ start_time: null, end_time: null });
    expect(timesFromStartAndDuration('', 60)).toEqual({ start_time: null, end_time: null });
    expect(eventDurationMinutes(...Object.values(timesFromStartAndDuration('23:00', 120)) as [string, string])).toBeNull(); // wraps past midnight → not a positive span
  });

  it('formatKm / formatActivityDuration', () => {
    expect(formatKm(20500)).toBe('20.5');
    expect(formatKm(0)).toBe('0.0');
    expect(formatActivityDuration(1500)).toBe('25min');
    expect(formatActivityDuration(3725)).toBe('1:02');
    expect(formatActivityDuration(7200)).toBe('2:00');
  });
});
