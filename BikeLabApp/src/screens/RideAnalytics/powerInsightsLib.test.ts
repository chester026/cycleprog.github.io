import {
  bestClimb,
  climbRows,
  durationKey,
  formatClock,
  formatKm,
  formatSignedPct,
  formatSignedWatts,
  headline,
  profilePaths,
  showsComparison,
  intervalsAxis,
  intervalsVerdict,
  isEasyRide,
} from './powerInsightsLib';
import type { RidePowerInsightsDto, RideSegmentDto } from '@bikelab/shared/api';

const row = (
  over: Partial<RidePowerInsightsDto['efforts'][number]>,
): RidePowerInsightsDto['efforts'][number] => ({
  seconds: 1200,
  watts: 230,
  best_watts: 250,
  best_activity_id: 1,
  best_date: '2026-10-01',
  rank: 4,
  total: 10,
  pct_of_best: 92,
  gap_w: 20,
  is_pr: false,
  ...over,
});

const insights = (
  over: Partial<RidePowerInsightsDto>,
): RidePowerInsightsDto => ({
  intensity: 'threshold',
  ftp: null,
  highlight: null,
  efforts: [],
  recent: null,
  pacing: null,
  weeks: 12,
  partial: false,
  ...over,
});

describe('powerInsightsLib', () => {
  it('durationKey', () => {
    expect([5, 60, 300, 1200, 3600].map(durationKey)).toEqual([
      '5s',
      '1m',
      '5m',
      '20m',
      '1h',
    ]);
  });

  it('headline only for a best or a top-3; nothing for a plain ride', () => {
    expect(
      headline(insights({ highlight: { seconds: 1200, rank: 1, total: 8 } })),
    ).toEqual({ kind: 'pr', subject: '20m', rank: 1, total: 8 });
    expect(
      headline(insights({ highlight: { seconds: 300, rank: 3, total: 8 } })),
    ).toEqual({ kind: 'top', subject: '5m', rank: 3, total: 8 });
    // a "best" among one ride is no best
    expect(
      headline(
        insights({
          highlight: { seconds: 300, rank: 1, total: 1 },
          intensity: 'tempo',
        }),
      ),
    ).toBeNull();
    expect(headline(insights({ intensity: null }))).toBeNull();
  });

  it('showsComparison hides sprint ranks on easy rides unless they are a top-3 or a best', () => {
    const hard = insights({ intensity: 'threshold' });
    const easy = insights({ intensity: 'endurance' });
    expect(showsComparison(hard, row({}))).toBe(true);
    expect(showsComparison(easy, row({}))).toBe(false);
    expect(showsComparison(easy, row({ rank: 2 }))).toBe(true);
    expect(showsComparison(easy, row({ is_pr: true, rank: 1 }))).toBe(true);
    expect(showsComparison(hard, row({ watts: null, rank: null }))).toBe(false);
    expect(showsComparison(hard, row({ total: 1 }))).toBe(false);
    expect(showsComparison(hard, row({ best_watts: null }))).toBe(false);
    expect(showsComparison(insights({ intensity: null }), row({}))).toBe(true);
  });

  it('climbRows keeps real climbs, longest first, capped; bestClimb picks the strongest', () => {
    const seg = (
      kind: RideSegmentDto['kind'],
      distance_m: number,
      avg_w: number | null,
    ): RideSegmentDto => ({
      kind,
      start_s: 0,
      duration_s: 600,
      distance_m,
      grade_pct: 6,
      avg_w,
      avg_hr: 150,
      avg_speed_kmh: 15,
      avg_cadence: 80,
    });
    const rows = climbRows([
      seg('flat', 9000, 150),
      seg('climb', 400, 400),
      seg('climb', 2000, 260),
      seg('climb', 5000, 240),
      seg('descent', 3000, 80),
    ]);
    expect(rows.map(r => r.distance_m)).toEqual([5000, 2000]);
    expect(climbRows([{ ...seg('climb', 1500, 120), grade_pct: 0.6 }])).toEqual(
      [],
    );
    expect(
      climbRows(
        [seg('climb', 1000, 1), seg('climb', 2000, 2), seg('climb', 3000, 3)],
        2,
      ).map(r => r.distance_m),
    ).toEqual([3000, 2000]);
    expect(bestClimb(rows)?.avg_w).toBe(260);
    expect(bestClimb([seg('climb', 1000, null)])).toBeNull();
    expect(bestClimb([])).toBeNull();
  });

  it('formatters', () => {
    expect(formatKm(2450)).toBe('2.5 km');
    expect(formatKm(12400)).toBe('12 km');
    expect(formatClock(130)).toBe('2:10');
    expect(formatClock(3800)).toBe('1:03:20');
    expect(formatSignedPct(9.2)).toBe('+9.2%');
    expect(formatSignedPct(-3.4)).toBe('−3.4%');
    expect(formatSignedPct(-18.64)).toBe('−18.6%');
    expect(formatSignedPct(5)).toBe('+5.0%');
    expect(formatSignedPct(0.04)).toBe('0.0%');
    expect(formatSignedWatts(2.4)).toBe('+2 W');
    expect(formatSignedWatts(-3)).toBe('−3 W');
  });
});

describe('profilePaths', () => {
  it('scales a rising profile to the box and closes the area to the baseline', () => {
    const { line, area } = profilePaths([100, 150, 200], 90, 40);
    expect(line.startsWith('M0 38')).toBe(true); // lowest point at the bottom (minus padding)
    expect(line.endsWith('90 2')).toBe(true); // highest at the top
    expect(line.match(/C/g)).toHaveLength(2);
    expect(area).toBe(`${line} L90 40 L0 40 Z`);
  });

  it('a flat profile sits in the middle; a single point is just a move', () => {
    expect(profilePaths([5, 5], 10, 20).line).toBe(
      'M0 10 C1.7 10 8.3 10 10 10',
    );
    expect(profilePaths([5], 10, 20).line).toBe('M0 10');
  });
});

describe('intervalsAxis / intervalsVerdict', () => {
  const block = (avgW: number) => ({
    index: 1,
    startS: 0,
    durationS: 480,
    avgW,
    avgHr: null,
    inTargetPct: null,
    vsTarget: null,
    inSet: true,
  });
  const set = {
    reps: 3,
    durationS: 480,
    restS: 240,
    avgW: 180,
    fadePct: 0,
    hits: 3,
  };
  const target = { low: 170, high: 190, source: 'plan' as const };

  it('zooms the axis around the target, and runs from zero without one', () => {
    expect(
      intervalsAxis({ blocks: [block(172), block(188)], set: null, target }),
    ).toEqual({ lo: 155, span: 50 });
    // a block outside the target stretches the axis to include it
    expect(
      intervalsAxis({ blocks: [block(140), block(230)], set: null, target }),
    ).toEqual({ lo: 125, span: 120 });
    // a narrow target still gets room around it; never below zero
    expect(
      intervalsAxis({
        blocks: [block(3)],
        set: null,
        target: { low: 200, high: 202, source: 'name' as const },
      }),
    ).toEqual({ lo: 0, span: 207 });
    expect(
      intervalsAxis({
        blocks: [block(180), block(250)],
        set: null,
        target: null,
      }),
    ).toEqual({ lo: 0, span: 250 });
    expect(
      intervalsAxis({ blocks: [block(0)], set: null, target: null }),
    ).toEqual({ lo: 0, span: 1 });
  });

  it('the verdict counts efforts in or above the target; none without a target or a set', () => {
    const b = (vsTarget: 'below' | 'in' | 'above', inSet = true) => ({
      ...block(180),
      vsTarget,
      inSet,
    });
    expect(
      intervalsVerdict({ blocks: [b('in'), b('in'), b('in')], set, target }),
    ).toEqual({ hits: 3, reps: 3, tone: 'up' });
    // over the range is extra work: it counts, and the pill takes the power colour
    expect(
      intervalsVerdict({
        blocks: [b('in'), b('above'), b('above')],
        set,
        target,
      }),
    ).toEqual({ hits: 3, reps: 3, tone: 'over' });
    expect(
      intervalsVerdict({
        blocks: [b('below'), b('in'), b('above')],
        set,
        target,
      }),
    ).toEqual({ hits: 2, reps: 3, tone: 'neutral' });
    expect(
      intervalsVerdict({
        blocks: [b('below'), b('below'), b('below')],
        set,
        target,
      })?.tone,
    ).toBe('down');
    // a stray effort next to the set is not counted
    expect(
      intervalsVerdict({
        blocks: [b('in'), b('in'), b('in'), b('above', false)],
        set,
        target,
      })?.tone,
    ).toBe('up');
    expect(
      intervalsVerdict({ blocks: [b('in')], set, target: null }),
    ).toBeNull();
    expect(
      intervalsVerdict({ blocks: [b('in')], set: null, target }),
    ).toBeNull();
  });
});

describe('isEasyRide', () => {
  it('is true under IF 0.7 only', () => {
    expect(isEasyRide(0.56)).toBe(true);
    expect(isEasyRide(0.69)).toBe(true);
    expect(isEasyRide(0.7)).toBe(false);
    expect(isEasyRide(0.78)).toBe(false);
    expect(isEasyRide(0)).toBe(false);
    expect(isEasyRide(null)).toBe(false);
    expect(isEasyRide(undefined)).toBe(false);
  });
});
