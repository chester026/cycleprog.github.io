import { describe, it, expect } from 'vitest';
import {
  bestEffort,
  bestEfforts,
  toOneHertz,
  mergeBestEfforts,
  powerProfile,
  estimateFtp,
  powerZones,
  wPerKg,
  DEFAULT_POWER_DURATIONS,
} from './powerProfile.js';

const flat = (watts: number, seconds: number) => new Array<number>(seconds).fill(watts);

describe('bestEffort', () => {
  it('finds the highest rolling mean', () => {
    // 100 x4, 300 x2, 100 x4: best 2 s = 300, best 4 s = (100+300+300+100)/4 = 200
    const w = [...flat(100, 4), ...flat(300, 2), ...flat(100, 4)];
    expect(bestEffort(w, 2)).toBe(300);
    expect(bestEffort(w, 4)).toBe(200);
    expect(bestEffort(w, 10)).toBe(140);
  });

  it('is null when the ride is shorter than the window or the window is empty', () => {
    expect(bestEffort([100, 100], 3)).toBeNull();
    expect(bestEffort([100, 100], 0)).toBeNull();
    expect(bestEffort([], 1)).toBeNull();
  });

  it('honours the sample rate', () => {
    // 2 Hz: 4 samples = 2 s
    expect(bestEffort([100, 100, 200, 200], 2, 2)).toBe(150);
    expect(bestEffort([100, 100, 200, 200], 3, 2)).toBeNull();
  });
});

describe('bestEfforts', () => {
  it('rounds and omits durations longer than the ride', () => {
    const w = [...flat(200, 60), ...flat(301, 60)];
    expect(bestEfforts(w, [5, 60, 120, 300])).toEqual({ 5: 301, 60: 301, 120: 251 });
  });

  it('defaults to the standard durations', () => {
    expect(Object.keys(bestEfforts(flat(150, 300))).map(Number)).toEqual([5, 60, 300]);
    expect(DEFAULT_POWER_DURATIONS).toEqual([5, 60, 300, 1200, 3600]);
  });
});

describe('toOneHertz', () => {
  it('passes a clean 1 Hz stream through', () => {
    expect(toOneHertz([0, 1, 2], [100, 200, 300])).toEqual([100, 200, 300]);
  });

  it('holds the reading over a short recording gap', () => {
    expect(toOneHertz([0, 3, 4], [100, 200, 300])).toEqual([100, 100, 100, 200, 300]);
  });

  it('zero-fills a long pause so a window cannot stitch across it', () => {
    expect(toOneHertz([0, 1, 10, 11], [200, 200, 200, 200])).toEqual([200, 200, 0, 0, 0, 0, 0, 0, 0, 0, 200, 200]);
  });

  it('treats missing or negative watts as 0 and starts from the first timestamp', () => {
    expect(toOneHertz([10, 11, 12], [Number.NaN, -4, 250])).toEqual([0, 0, 250]);
  });

  it('uses the shorter of the two arrays and handles empty input', () => {
    expect(toOneHertz([0, 1, 2, 3], [100, 100])).toEqual([100, 100]);
    expect(toOneHertz([], [])).toEqual([]);
  });

  it('caps absurd time spans', () => {
    expect(toOneHertz([0, 10_000_000], [100, 100])).toHaveLength(24 * 3600);
  });
});

describe('powerProfile / mergeBestEfforts', () => {
  const easy = { activityId: 1, date: '2026-09-01', watts: flat(150, 3700) };
  const hard = { activityId: 2, date: '2026-09-20', watts: [...flat(100, 600), ...flat(280, 1200), ...flat(100, 600)] };

  it('takes the best per duration across rides and records where it came from', () => {
    const profile = powerProfile([easy, hard]);
    expect(profile[5]).toEqual({ watts: 280, activityId: 2, date: '2026-09-20' });
    expect(profile[1200]).toEqual({ watts: 280, activityId: 2, date: '2026-09-20' });
    // only the long easy ride reaches 60 min
    expect(profile[3600]).toEqual({ watts: 150, activityId: 1, date: '2026-09-01' });
  });

  it('keeps the earlier ride on a tie and omits durations nobody reached', () => {
    const profile = mergeBestEfforts(
      [
        { activityId: 1, date: 'a', efforts: { 5: 300 } },
        { activityId: 2, date: 'b', efforts: { 5: 300, 60: 250 } },
      ],
      [5, 60, 300]
    );
    expect(profile).toEqual({ 5: { watts: 300, activityId: 1, date: 'a' }, 60: { watts: 250, activityId: 2, date: 'b' } });
  });

  it('is empty without rides', () => {
    expect(powerProfile([])).toEqual({});
  });
});

describe('estimateFtp', () => {
  it('is 95% of the best 20 min', () => {
    expect(estimateFtp({ 1200: { watts: 280, activityId: 2, date: 'd' }, 3600: { watts: 200, activityId: 1, date: 'e' } })).toEqual({
      watts: 266,
      method: 'ftp20',
      activityId: 2,
      date: 'd',
    });
  });

  it('falls back to the best 60 min as-is', () => {
    expect(estimateFtp({ 3600: { watts: 201.4, activityId: 1, date: 'e' } })).toEqual({
      watts: 201,
      method: 'ftp60',
      activityId: 1,
      date: 'e',
    });
  });

  it('is null with neither', () => {
    expect(estimateFtp({ 300: { watts: 300, activityId: 1, date: 'e' } })).toBeNull();
  });
});

describe('powerZones', () => {
  it('builds Coggan zones from FTP 200 as contiguous whole-watt bands', () => {
    expect(powerZones(200).map(({ zone, minW, maxW }) => [zone, minW, maxW])).toEqual([
      [1, 0, 110],
      [2, 111, 150],
      [3, 151, 180],
      [4, 181, 210],
      [5, 211, 240],
      [6, 241, 300],
      [7, 301, null],
    ]);
    expect(powerZones(200)[3].name).toBe('Threshold');
  });
});

describe('wPerKg', () => {
  it('rounds to two decimals', () => {
    expect(wPerKg(266, 75)).toBe(3.55);
  });

  it('is null without a usable weight', () => {
    expect(wPerKg(266, null)).toBeNull();
    expect(wPerKg(266, undefined)).toBeNull();
    expect(wPerKg(266, 0)).toBeNull();
  });
});
