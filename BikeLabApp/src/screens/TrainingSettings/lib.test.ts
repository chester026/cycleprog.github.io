import {isWithinRange, parseNumberInput} from './lib';

describe('parseNumberInput', () => {
  it('treats blank as not set and accepts a decimal comma', () => {
    expect(parseNumberInput('  ')).toBeNull();
    expect(parseNumberInput('5,5')).toBe(5.5);
    expect(parseNumberInput('abc')).toBeNaN();
  });
});

describe('isWithinRange', () => {
  it('accepts the bounds and an empty field, rejects outside values', () => {
    expect(isWithinRange('', 1, 40)).toBe(true);
    expect(isWithinRange('1', 1, 40)).toBe(true);
    expect(isWithinRange('40', 1, 40)).toBe(true);
    expect(isWithinRange('0', 1, 40)).toBe(false);
    expect(isWithinRange('40.5', 1, 40)).toBe(false);
    expect(isWithinRange('x', 1, 40)).toBe(false);
  });

  it('rejects fractional workouts when integers are required', () => {
    expect(isWithinRange('3', 1, 14, true)).toBe(true);
    expect(isWithinRange('3.5', 1, 14, true)).toBe(false);
    expect(isWithinRange('15', 1, 14, true)).toBe(false);
  });
});
