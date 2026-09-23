import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, getDateOfISOWeek, getISOWeekNumber, getISOYear, median, startOfDayLocal, toDateKeyLocal } from './dates.js';

describe('getISOWeekNumber', () => {
  it('computes a normal mid-year week', () => {
    // 2024-06-17 is a Monday, ISO week 25.
    expect(getISOWeekNumber(new Date(2024, 5, 17))).toBe(25);
  });

  it('puts Jan 1 in week 52 of the previous ISO year when it falls on a Sunday', () => {
    // 2023-01-01 is a Sunday -> belongs to ISO week 52 of 2022.
    expect(getISOWeekNumber(new Date(2023, 0, 1))).toBe(52);
  });

  it('puts Jan 1 in week 53 of the previous ISO year when the previous year has 53 weeks', () => {
    // 2016-01-01 is a Friday -> ISO week 53 of 2015 (2015 is a 53-week year).
    expect(getISOWeekNumber(new Date(2016, 0, 1))).toBe(53);
  });

  it('puts Dec 31 in week 1 of the next ISO year when it falls early in the week', () => {
    // 2018-12-31 is a Monday -> ISO week 1 of 2019.
    expect(getISOWeekNumber(new Date(2018, 11, 31))).toBe(1);
  });

  it('accepts an ISO date string, matching call sites that pass activity.start_date', () => {
    expect(getISOWeekNumber('2024-06-17')).toBe(getISOWeekNumber(new Date(2024, 5, 17)));
  });
});

describe('getISOYear', () => {
  it('matches the calendar year for a mid-year date', () => {
    expect(getISOYear(new Date(2024, 5, 17))).toBe(2024);
  });

  it('resolves Jan 1 to the previous ISO year when applicable', () => {
    expect(getISOYear(new Date(2023, 0, 1))).toBe(2022);
  });

  it('resolves Dec 31 to the next ISO year when applicable', () => {
    expect(getISOYear(new Date(2018, 11, 31))).toBe(2019);
  });

  it('does not mutate its input', () => {
    const input = new Date(2023, 0, 1);
    const before = input.getTime();
    getISOYear(input);
    expect(input.getTime()).toBe(before);
  });
});

describe('getDateOfISOWeek', () => {
  it('returns the Monday starting week 1', () => {
    // ISO week 1 of 2024 starts Monday 2024-01-01.
    const d = getDateOfISOWeek(1, 2024);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
    expect(d.getDay()).toBe(1); // Monday
  });

  it('round-trips with getISOWeekNumber for a mid-year week', () => {
    const monday = getDateOfISOWeek(25, 2024);
    expect(getISOWeekNumber(monday)).toBe(25);
  });

  it('never returns the same object reference twice (no in-place mutation)', () => {
    const a = getDateOfISOWeek(10, 2024);
    const b = getDateOfISOWeek(20, 2024);
    expect(a).not.toBe(b);
    expect(a.getTime()).not.toBe(b.getTime());
  });

  it('takes the "late in week" branch when Jan 1 + (week-1)*7 falls on Fri/Sat/Sun', () => {
    // Jan 1 2022 is a Saturday (JS getDay()=6, so dow>4 for every week of
    // 2022, since weekday(Jan1 + 7k) === weekday(Jan1)) -> exercises the
    // `simple.getDate() + 8 - simple.getDay()` branch instead of the
    // `dow <= 4` one already covered above.
    const d = getDateOfISOWeek(1, 2022);
    expect(d.getFullYear()).toBe(2022);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(3); // Monday 2022-01-03
    expect(d.getDay()).toBe(1); // Monday
    expect(getISOWeekNumber(d)).toBe(1);
  });
});

describe('startOfDayLocal', () => {
  it('zeroes out the time-of-day', () => {
    const d = startOfDayLocal(new Date(2024, 5, 17, 13, 45, 30, 500));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getDate()).toBe(17);
  });

  it('does not mutate its input', () => {
    const input = new Date(2024, 5, 17, 13, 45);
    const before = input.getTime();
    startOfDayLocal(input);
    expect(input.getTime()).toBe(before);
  });
});

describe('toDateKeyLocal', () => {
  it('formats as YYYY-MM-DD in local time', () => {
    expect(toDateKeyLocal(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toDateKeyLocal(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('pads single-digit months and days', () => {
    expect(toDateKeyLocal(new Date(2024, 2, 9))).toBe('2024-03-09');
  });
});

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('handles a single value', () => {
    expect(median([42])).toBe(42);
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('ageFromBirthDate', () => {
  const asOf = new Date(Date.UTC(2026, 8, 23)); // 2026-09-23
  it('counts whole years, birthday not yet reached this year', () => {
    expect(ageFromBirthDate('1991-10-05', asOf)).toBe(34);
  });
  it('counts the birthday itself and after it', () => {
    expect(ageFromBirthDate('1991-09-23', asOf)).toBe(35);
    expect(ageFromBirthDate('1991-01-05', asOf)).toBe(35);
  });
  it('accepts a full ISO timestamp (pg DATE serialised by a client)', () => {
    expect(ageFromBirthDate('1991-09-23T00:00:00.000Z', asOf)).toBe(35);
  });
  it('returns null for empty, malformed, impossible and future dates', () => {
    expect(ageFromBirthDate(null, asOf)).toBeNull();
    expect(ageFromBirthDate(undefined, asOf)).toBeNull();
    expect(ageFromBirthDate('', asOf)).toBeNull();
    expect(ageFromBirthDate('05.10.1991', asOf)).toBeNull();
    expect(ageFromBirthDate('1991-02-30', asOf)).toBeNull();
    expect(ageFromBirthDate('2030-01-01', asOf)).toBeNull();
  });
  it('defaults asOf to now', () => {
    expect(ageFromBirthDate('1900-01-01')).toBeGreaterThan(100);
  });
});
