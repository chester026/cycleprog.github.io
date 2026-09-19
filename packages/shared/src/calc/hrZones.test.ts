import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeHrZones, zoneForHr, zoneName } from './hrZones.js';

describe('computeHrZones', () => {
  it('uses the LTHR method when lactate_threshold is present, even with max_hr/resting_hr also set', () => {
    const zones = computeHrZones({ max_hr: 190, resting_hr: 50, lactate_threshold: 165, age: 30 });
    expect(zones.method).toBe('lthr');
    expect(zones.basis).toEqual({ max_hr: 190, resting_hr: 50, lactate_threshold: 165 });
    expect(zones.zones).toHaveLength(5);
    expect(zones.zones[0]).toMatchObject({ id: 1, key: 'z1', name: 'Recovery', min: Math.round(165 * 0.75), max: Math.round(165 * 0.85) });
    expect(zones.zones[4]).toMatchObject({ id: 5, key: 'z5', name: 'VO2 Max', min: Math.round(165 * 1.03), max: null });
  });

  it('uses the Karvonen method when both max_hr and resting_hr are known and there is no lactate_threshold', () => {
    const zones = computeHrZones({ max_hr: 190, resting_hr: 50 });
    expect(zones.method).toBe('karvonen');
    expect(zones.basis).toEqual({ max_hr: 190, resting_hr: 50 });
    const reserve = 190 - 50;
    expect(zones.zones[0]).toMatchObject({ min: Math.round(50 + reserve * 0.5), max: Math.round(50 + reserve * 0.6) });
    expect(zones.zones[4]).toMatchObject({ min: Math.round(50 + reserve * 0.9), max: null });
  });

  it('falls back to %maxHR when only max_hr is known', () => {
    const zones = computeHrZones({ max_hr: 190 });
    expect(zones.method).toBe('maxhr');
    expect(zones.basis).toEqual({ max_hr: 190 });
    expect(zones.zones[0]).toMatchObject({ min: Math.round(190 * 0.5), max: Math.round(190 * 0.6) });
    expect(zones.zones[4]).toMatchObject({ min: Math.round(190 * 0.9), max: null });
  });

  it('derives max_hr from age (220 - age) when max_hr is missing', () => {
    const zones = computeHrZones({ age: 30 });
    expect(zones.method).toBe('maxhr');
    expect(zones.basis.max_hr).toBe(190);
  });

  it('derives age from birth_date when age is missing', () => {
    const now = new Date();
    const birthYear = now.getFullYear() - 30;
    const zones = computeHrZones({ birth_date: `${birthYear}-01-01` });
    expect(zones.basis.max_hr).toBe(190);
  });

  it('falls back to 190 bpm when there is no max_hr, age, or birth_date at all', () => {
    const zones = computeHrZones({});
    expect(zones.method).toBe('maxhr');
    expect(zones.basis.max_hr).toBe(190);
  });

  it('prefers an explicit max_hr over one derived from age', () => {
    const zones = computeHrZones({ max_hr: 200, age: 30 });
    expect(zones.basis.max_hr).toBe(200);
  });

  it('uses Karvonen when resting_hr is present and max_hr can be derived from age', () => {
    const zones = computeHrZones({ resting_hr: 50, age: 30 });
    expect(zones.method).toBe('karvonen');
    expect(zones.basis).toEqual({ max_hr: 190, resting_hr: 50 });
  });

  it('falls back to %maxHR when resting_hr is present but max_hr cannot be derived at all', () => {
    const zones = computeHrZones({ resting_hr: 50 });
    expect(zones.method).toBe('maxhr');
    expect(zones.basis.max_hr).toBe(190);
  });

  it('rounds every boundary to an integer bpm', () => {
    const zones = computeHrZones({ max_hr: 187, resting_hr: 53 });
    for (const zone of zones.zones) {
      expect(Number.isInteger(zone.min)).toBe(true);
      if (zone.max !== null) expect(Number.isInteger(zone.max)).toBe(true);
    }
  });

  it('produces contiguous zones (zone N max === zone N+1 min)', () => {
    const zones = computeHrZones({ max_hr: 190, resting_hr: 50, lactate_threshold: 165 });
    for (let i = 0; i < zones.zones.length - 1; i += 1) {
      expect(zones.zones[i].max).toBe(zones.zones[i + 1].min);
    }
    expect(zones.zones[4].max).toBeNull();
  });

  it('always returns 5 zones with ids 1..5, keys z1..z5 and the shared zone colors', () => {
    const zones = computeHrZones({ max_hr: 190, resting_hr: 50 });
    expect(zones.zones.map((z) => z.id)).toEqual([1, 2, 3, 4, 5]);
    expect(zones.zones.map((z) => z.key)).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
    expect(zones.zones.map((z) => z.nameKey)).toEqual(['zones.z1', 'zones.z2', 'zones.z3', 'zones.z4', 'zones.z5']);
    expect(new Set(zones.zones.map((z) => z.color)).size).toBe(5);
  });
});

describe('zoneForHr', () => {
  const zones = computeHrZones({ max_hr: 190, resting_hr: 50 });

  it('finds the zone containing a bpm value', () => {
    expect(zoneForHr(zones, zones.zones[0].min)).toBe(1);
    expect(zoneForHr(zones, zones.zones[2].min + 1)).toBe(3);
  });

  it('returns 5 (unbounded) for any bpm at or above zone 5s floor', () => {
    expect(zoneForHr(zones, zones.zones[4].min)).toBe(5);
    expect(zoneForHr(zones, zones.zones[4].min + 100)).toBe(5);
  });

  it('returns null for a bpm below zone 1s floor', () => {
    expect(zoneForHr(zones, zones.zones[0].min - 1)).toBeNull();
  });

  it('accepts a plain zone-band array as well as an HrZones object', () => {
    expect(zoneForHr(zones.zones, zones.zones[0].min)).toBe(1);
  });

  it('is edge-inclusive at zone boundaries (boundary bpm belongs to the higher zone)', () => {
    const boundary = zones.zones[0].max as number;
    expect(zoneForHr(zones, boundary)).toBe(2);
  });
});

describe('computeHrZones — age derived from birth_date', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // fixed "now": 2024-06-15
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 190bpm fallback (age null) when birth_date does not parse', () => {
    const zones = computeHrZones({ birth_date: 'not-a-date' });
    expect(zones.basis.max_hr).toBe(190);
  });

  it('subtracts a year when the birthday month is later in the year than "now" (monthDiff < 0)', () => {
    // now = 2024-06-15 (month index 5). Birth month index 6 (July) > 5 ->
    // monthDiff = 5 - 6 = -1 < 0 -> age -= 1.
    const zones = computeHrZones({ birth_date: '1994-07-20' });
    // Without the correction: 2024-1994=30 -> maxHr 190. With it: age 29 -> maxHr 191.
    expect(zones.basis.max_hr).toBe(220 - 29);
  });

  it('subtracts a year when it is the birthday month but the birthday has not happened yet this month (monthDiff === 0, day not yet reached)', () => {
    // now = 2024-06-15. Birth day 20 > 15, same month -> age -= 1.
    const zones = computeHrZones({ birth_date: '1994-06-20' });
    expect(zones.basis.max_hr).toBe(220 - 29);
  });

  it('does not subtract a year once the birthday has passed this month (monthDiff === 0, day already reached)', () => {
    // now = 2024-06-15. Birth day 10 <= 15, same month -> no correction.
    const zones = computeHrZones({ birth_date: '1994-06-10' });
    expect(zones.basis.max_hr).toBe(220 - 30);
  });

  it('does not subtract a year when the birthday month already passed this year (monthDiff > 0)', () => {
    // now = 2024-06-15. Birth month index 0 (Jan) < 5 -> monthDiff = 5 > 0 -> no correction.
    const zones = computeHrZones({ birth_date: '1994-01-10' });
    expect(zones.basis.max_hr).toBe(220 - 30);
  });
});

describe('zoneName', () => {
  it('returns the default English name for each zone id', () => {
    expect(zoneName(1)).toBe('Recovery');
    expect(zoneName(5)).toBe('VO2 Max');
  });
});
