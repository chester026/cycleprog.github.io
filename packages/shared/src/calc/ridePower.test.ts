import { describe, expect, it } from 'vitest';
import { normalizedPower, ridePowerBreakdown, toMovingOneHertz } from './ridePower.js';
import type { RidePowerStreams } from './ridePower.js';

// A synthetic ride: `n` seconds at 1 Hz. `profile(i)` returns metres of
// altitude at second i; speed is constant unless overridden.
function ride(
  n: number,
  { watts, alt, speed = 8, hr, cad, time }: {
    watts?: (i: number) => number | null;
    alt?: (i: number) => number | null;
    speed?: number | ((i: number) => number | null);
    hr?: (i: number) => number | null;
    cad?: (i: number) => number | null;
    time?: number[];
  } = {},
): RidePowerStreams {
  const idx = Array.from({ length: n }, (_, i) => i);
  const s: RidePowerStreams = { time: { data: time ?? idx } };
  if (watts) s.watts = { data: idx.map(watts) };
  if (alt) s.altitude = { data: idx.map(alt) };
  s.velocity_smooth = { data: idx.map((i) => (typeof speed === 'function' ? speed(i) : speed)) };
  if (hr) s.heartrate = { data: idx.map(hr) };
  if (cad) s.cadence = { data: idx.map(cad) };
  return s;
}

describe('normalizedPower', () => {
  it('equals the average for a constant stream and null for an empty one', () => {
    expect(normalizedPower(new Array(120).fill(200))).toBe(200);
    expect(normalizedPower([])).toBeNull();
  });
  it('is above the average for a spiky stream and uses the full stream when shorter than 30 s', () => {
    const spiky = Array.from({ length: 600 }, (_, i) => (i % 60 < 30 ? 400 : 0));
    expect(normalizedPower(spiky)).toBeGreaterThan(200);
    expect(normalizedPower([100, 300])).toBe(200);
  });
});

describe('ridePowerBreakdown — no data', () => {
  it('returns an empty "none" breakdown for null / empty streams', () => {
    for (const s of [null, undefined, {}, { watts: { data: [] } }]) {
      const r = ridePowerBreakdown(s as RidePowerStreams | null | undefined);
      expect(r.source).toBe('none');
      expect(r.duration_s).toBe(0);
      expect(r.segments).toEqual([]);
      expect(r.avg_w).toBeNull();
    }
  });

  it('a ride whose watts are all null/zero is a "none" ride with segments only', () => {
    const r = ridePowerBreakdown(ride(1200, { watts: (i) => (i % 2 ? 0 : null), alt: () => 100 }));
    expect(r.source).toBe('none');
    expect(r.np_w).toBeNull();
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'flat', avg_w: null, avg_hr: null, avg_cadence: null });
  });

  it('without altitude or speed there are no segments', () => {
    const noAlt = ridePowerBreakdown(ride(600, { watts: () => 200 }));
    expect(noAlt.segments).toEqual([]);
    expect(noAlt.source).toBe('meter');
    const noSpeed = ridePowerBreakdown({ watts: { data: [200, 200] }, altitude: { data: [1, 2] } });
    expect(noSpeed.segments).toEqual([]);
  });
});

describe('ridePowerBreakdown — power-meter ride', () => {
  const flat = ride(3600, { watts: () => 200, alt: () => 50, hr: () => 150, cad: () => 90 });

  it('computes NP/avg/max/VI and this ride\'s best efforts', () => {
    const r = ridePowerBreakdown(flat);
    expect(r.source).toBe('meter');
    expect(r.duration_s).toBe(3599);
    expect(r.avg_w).toBe(200);
    expect(r.np_w).toBe(200);
    expect(r.max_w).toBe(200);
    expect(r.vi).toBe(1);
    expect(r.best_efforts_w).toEqual({ 5: 200, 60: 200, 300: 200, 1200: 200, 3600: 200 });
    expect(r.if_).toBeNull();
    expect(r.tss).toBeNull();
    expect(r.zones_s).toEqual([]);
    expect(r.fade).toEqual({ first_half_w: 200, second_half_w: 200, pct: 0 });
    expect(r.coasting_pct).toBe(0);
  });

  it('with an FTP fills IF, TSS and time in zones', () => {
    const r = ridePowerBreakdown(flat, { ftp: 250 });
    expect(r.if_).toBe(0.8);
    expect(r.tss).toBe(64); // 1h at IF 0.8
    expect(r.zones_s).toHaveLength(7);
    expect(r.zones_s.reduce((a, b) => a + b, 0)).toBe(3600);
    expect(r.zones_s[2]).toBe(3600); // 200 W at FTP 250 = Z3 tempo
    expect(ridePowerBreakdown(flat, { ftp: 0 }).if_).toBeNull();
  });

  it('measures fade and coasting', () => {
    const r = ridePowerBreakdown(
      ride(1000, { watts: (i) => (i < 500 ? 300 : i % 2 ? 0 : 200), speed: (i) => (i < 20 ? 0.5 : 8) }),
    );
    expect(r.fade?.first_half_w).toBe(300);
    expect(r.fade?.second_half_w).toBe(100);
    expect(r.fade?.pct).toBeCloseTo(-66.7);
    // 980 moving samples, 250 of them at 0 W
    expect(r.coasting_pct).toBe(26);
  });

  it('fade pct is 0 when the first half is all zeros; null watt samples count as 0 W', () => {
    const r = ridePowerBreakdown(ride(100, { watts: (i) => (i >= 50 ? 100 : i % 2 ? null : 0) }));
    expect(r.fade?.pct).toBe(0);
    expect(r.vi).toBeGreaterThan(1);
    const zeroAvg = ridePowerBreakdown({ watts: { data: [1] }, time: { data: [0] } });
    expect(zeroAvg.fade).toBeNull();
    expect(zeroAvg.coasting_pct).toBeNull();
  });

  it('handles a missing time stream (1 Hz assumed), auto-pause gaps and duplicate timestamps', () => {
    const noTime = ridePowerBreakdown({ watts: { data: [100, 100, 100] } });
    expect(noTime.duration_s).toBe(2);
    expect(noTime.avg_w).toBe(100);
    // 10 s of riding, a 600 s pause, 10 s of riding — the pause is not 600 s of 0 W:
    // average/NP/TSS are on moving time, best efforts keep the stop as zeros
    const time = [...Array.from({ length: 10 }, (_, i) => i), ...Array.from({ length: 10 }, (_, i) => 700 + i)];
    const paused = ridePowerBreakdown(ride(20, { watts: () => 200, alt: () => 0, time }), { ftp: 200 });
    expect(paused.duration_s).toBe(709);
    expect(paused.moving_s).toBe(20);
    expect(paused.avg_w).toBe(200);
    expect(paused.np_w).toBe(200);
    expect(paused.zones_s.reduce((a, b) => a + b, 0)).toBe(20);
    expect(paused.best_efforts_w[60]).toBeLessThan(200); // the 60-s window spans the stop
    expect(paused.segments[0].duration_s).toBe(20);
    expect(toMovingOneHertz([0, 2, 100, 101], [100, 200, 300, 400])).toEqual([100, 100, 200, 300, 400]);
    expect(toMovingOneHertz([0, 0, 1], [1, 2, 3])).toEqual([2, 3]);
    expect(toMovingOneHertz([0, 1], [Number.NaN, -5])).toEqual([0, 0]);
    const dup = ridePowerBreakdown(ride(3, { watts: () => 200, alt: () => 0, time: [0, 0, 1] }));
    expect(dup.segments[0].duration_s).toBe(2);
  });
});

describe('ridePowerBreakdown — segments', () => {
  // 10 km at 8 m/s: 2.5 km flat, 2.5 km at 6 %, 2.5 km at −6 %, 2.5 km flat.
  const n = 1250;
  const alt = (i: number): number => {
    const m = i * 8;
    if (m < 2500) return 100;
    if (m < 5000) return 100 + (m - 2500) * 0.06;
    if (m < 7500) return 250 - (m - 5000) * 0.06;
    return 100;
  };

  it('splits a ride into flat / climb / descent / flat with per-segment metrics', () => {
    const r = ridePowerBreakdown(
      ride(n, { watts: (i) => (alt(i + 1) > alt(i) ? 300 : 150), alt, hr: (i) => (alt(i + 1) > alt(i) ? 170 : 130), cad: () => 85 }),
      { ftp: 250 },
    );
    expect(r.segments.map((s) => s.kind)).toEqual(['flat', 'climb', 'descent', 'flat']);
    const climb = r.segments[1];
    expect(climb.grade_pct).toBeCloseTo(6, 0);
    expect(climb.distance_m).toBeCloseTo(2500, -2);
    expect(climb.avg_w).toBeGreaterThan(280);
    expect(climb.avg_hr).toBeGreaterThan(160);
    expect(climb.avg_speed_kmh).toBeCloseTo(28.8, 0);
    expect(climb.avg_cadence).toBe(85);
    expect(climb.start_s).toBeGreaterThan(250);
    expect(r.segments[2].grade_pct).toBeLessThan(-5);
  });

  it('folds runs shorter than 500 m into their neighbours, including a short opening run', () => {
    // 100 m climb at the very start, then flat
    const r = ridePowerBreakdown(ride(600, { alt: (i) => (i * 8 < 100 ? i * 8 * 0.1 : 10) }));
    expect(r.segments.map((s) => s.kind)).toEqual(['flat']);
    // a 400 m bump in the middle of a flat ride
    const bump = ridePowerBreakdown(ride(1000, { alt: (i) => (i * 8 > 3000 && i * 8 < 3400 ? (i * 8 - 3000) * 0.1 : i * 8 >= 3400 ? 40 : 0) }));
    expect(bump.segments.map((s) => s.kind)).toEqual(['flat']);
  });

  it('lists only the 12 longest runs, in ride order, when there are more', () => {
    // 30 alternating 1.2 km climbs and descents at 6 %, with one 2.4 km flat in the middle
    const r = ridePowerBreakdown(ride(4800, { alt: (i) => { const m = i * 8; if (m >= 18000 && m < 20400) return 0; const mm = m >= 20400 ? m - 2400 : m; const k = Math.floor(mm / 1200); return k % 2 ? 72 - (mm - k * 1200) * 0.06 : (mm - k * 1200) * 0.06; } }));
    expect(r.segments).toHaveLength(12);
    expect(r.segments.map((s) => s.kind)).toContain('climb');
    expect(r.segments.map((s) => s.kind)).toContain('descent');
    expect(r.segments.some((s) => s.kind === 'flat' && s.distance_m > 2000)).toBe(true);
    for (let i = 1; i < r.segments.length; i += 1) expect(r.segments[i].start_s).toBeGreaterThan(r.segments[i - 1].start_s);
  });

  it('null altitude samples inherit the previous classification; a stationary ride has one zero-length segment', () => {
    const r = ridePowerBreakdown(ride(600, { alt: (i) => (i % 3 ? null : i > 300 ? 100 + (i - 300) : 100) }));
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    const still = ridePowerBreakdown(ride(100, { alt: () => 5, speed: 0 }));
    expect(still.segments).toEqual([
      { kind: 'flat', start_s: 0, duration_s: 100, distance_m: 0, grade_pct: 0, avg_w: null, avg_hr: null, avg_speed_kmh: 0, avg_cadence: null },
    ]);
    const nullSpeed = ridePowerBreakdown(ride(100, { alt: () => 5, speed: () => null }));
    expect(nullSpeed.segments[0].distance_m).toBe(0);
  });
});
