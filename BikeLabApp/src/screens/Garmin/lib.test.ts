import {formatPairingCodeInput, isPairingCodeComplete} from './lib';

describe('garmin pairing code input', () => {
  it('formats digits as 123 456 and drops everything else', () => {
    expect(formatPairingCodeInput('12')).toBe('12');
    expect(formatPairingCodeInput('1234')).toBe('123 4');
    expect(formatPairingCodeInput('12a3 45-6789')).toBe('123 456');
  });

  it('is complete only with six digits', () => {
    expect(isPairingCodeComplete('123 45')).toBe(false);
    expect(isPairingCodeComplete('123 456')).toBe(true);
  });
});
