import {formatGarminDate, formatGarminDay, formatPairingCodeInput, garminHealthRows, isPairingCodeComplete} from './lib';

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

describe('formatGarminDate', () => {
  it('formats an ISO string or a Date as a local date', () => {
    const iso = '2026-11-08T09:58:38.000Z';
    expect(formatGarminDate(iso)).toBe(new Date(iso).toLocaleDateString());
    expect(formatGarminDate(new Date(iso))).toBe(new Date(iso).toLocaleDateString());
  });

  it('is an em dash when there is nothing to show', () => {
    expect(formatGarminDate(null)).toBe('—');
    expect(formatGarminDate(undefined)).toBe('—');
    expect(formatGarminDate('not a date')).toBe('—');
  });
});

describe('formatGarminDay', () => {
  it('shows the calendar day itself, whatever the time zone', () => {
    expect(formatGarminDay('2026-11-09')).toBe(new Date(2026, 10, 9).toLocaleDateString());
  });

  it('is an em dash for anything that is not a calendar day', () => {
    expect(formatGarminDay(null)).toBe('—');
    expect(formatGarminDay(undefined)).toBe('—');
    expect(formatGarminDay('2026-11-09T00:00:00Z')).toBe('—');
  });
});

describe('garminHealthRows', () => {
  const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${Object.values(options).join(',')}` : key);
  const full = {
    day: '2026-11-09',
    sleep_hours: 7.2,
    sleep_score: 81,
    hrv_ms: 48,
    hrv_status: 'BALANCED',
    resting_hr: 47,
    body_battery_high: 88,
    body_battery_low: 19,
    stress_avg: 28,
  };

  it('lists every measured figure in recovery order', () => {
    expect(garminHealthRows(full, t)).toEqual([
      {label: 'garmin.healthSleep', value: 'garmin.healthHoursValue:7.2'},
      {label: 'garmin.healthSleepScore', value: '81'},
      {label: 'garmin.healthHrv', value: 'garmin.healthMsValue:48'},
      {label: 'garmin.healthRestingHr', value: 'garmin.healthBpmValue:47'},
      {label: 'garmin.healthBodyBattery', value: '19–88'},
      {label: 'garmin.healthStress', value: '28'},
    ]);
  });

  it('skips what the watch did not measure — a day without a night keeps its daytime rows', () => {
    const rows = garminHealthRows({...full, sleep_hours: null, sleep_score: null, hrv_ms: null, body_battery_low: null}, t);
    expect(rows).toEqual([
      {label: 'garmin.healthRestingHr', value: 'garmin.healthBpmValue:47'},
      {label: 'garmin.healthBodyBattery', value: '88'},
      {label: 'garmin.healthStress', value: '28'},
    ]);
  });

  it('is empty without a health day', () => {
    expect(garminHealthRows(null, t)).toEqual([]);
    expect(garminHealthRows(undefined, t)).toEqual([]);
  });
});
