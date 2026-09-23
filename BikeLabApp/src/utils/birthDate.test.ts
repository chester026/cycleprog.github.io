import {birthDateToDate, dateToBirthDateString, isValidBirthDate} from './birthDate';

describe('birthDateToDate', () => {
  it('parses a valid ISO date into a local Date at midnight', () => {
    const date = birthDateToDate('1991-09-23');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(1991);
    expect(date!.getMonth()).toBe(8); // 0-indexed
    expect(date!.getDate()).toBe(23);
  });

  it('rejects a calendar-overflow date instead of rolling it forward', () => {
    expect(birthDateToDate('2024-02-30')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(birthDateToDate('23.09.1991')).toBeNull();
    expect(birthDateToDate('not-a-date')).toBeNull();
    expect(birthDateToDate('')).toBeNull();
    expect(birthDateToDate(null)).toBeNull();
    expect(birthDateToDate(undefined)).toBeNull();
  });
});

describe('dateToBirthDateString', () => {
  it('formats a local Date as YYYY-MM-DD, zero-padded', () => {
    expect(dateToBirthDateString(new Date(1991, 8, 23))).toBe('1991-09-23');
    expect(dateToBirthDateString(new Date(2005, 0, 5))).toBe('2005-01-05');
  });

  it('round-trips through birthDateToDate', () => {
    const iso = '1994-06-20';
    expect(dateToBirthDateString(birthDateToDate(iso)!)).toBe(iso);
  });
});

describe('isValidBirthDate', () => {
  const asOf = new Date(2026, 8, 23); // 2026-09-23

  it('accepts a past date', () => {
    expect(isValidBirthDate('1991-09-23', asOf)).toBe(true);
  });

  it('rejects a future date', () => {
    expect(isValidBirthDate('2030-01-01', asOf)).toBe(false);
  });

  it('rejects an unparseable value', () => {
    expect(isValidBirthDate('nope', asOf)).toBe(false);
    expect(isValidBirthDate(null, asOf)).toBe(false);
  });
});
