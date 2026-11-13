import { describe, expect, it } from 'vitest';
import { buildCourse, type Course } from './course.js';
import { courseOf } from './courseFixture.js';
import { raceIntensity, racePlan, speedForPower, type RacePlan } from './racePlan.js';

const course = (legs: Array<[number, number]>): Course => {
  const r = buildCourse(courseOf(legs), 'Test');
  if (!r.ok) throw new Error(r.error);
  return r.course;
};
const plan = (c: Course, rider = { ftp: 250, weight_kg: 72 }, options = {}): RacePlan => {
  const p = racePlan(c, rider, options);
  if (!p) throw new Error('no plan');
  return p;
};

// ~75 km: valley, a 6 km climb, descent, valley, a 9 km climb, a long descent, valley, a ramp, run-in.
const hilly = course([[8000, 0.3], [6000, 5.5], [4000, -4], [10000, 0.5], [9000, 6.5], [3000, 1], [12000, -5.5], [15000, -0.3], [1500, 8], [6000, 0]]);

// Six 1.2 km ramps at 9 % with 6 km descents between them.
const RAMPS: Array<[number, number]> = [[1000, 0], ...Array.from({ length: 6 }, () => [[1200, 9], [6000, -4]] as Array<[number, number]>).flat(), [3000, 0]];

describe('raceIntensity', () => {
  it('falls with the length of the race, and is lower for a steady ride', () => {
    expect(raceIntensity(0.5)).toBe(0.92);
    expect(raceIntensity(1)).toBe(0.92);
    expect(raceIntensity(1.5)).toBeCloseTo(0.885);
    expect(raceIntensity(3)).toBe(0.8);
    expect(raceIntensity(4.5)).toBeCloseTo(0.74);
    expect(raceIntensity(8)).toBe(0.72);
    expect(raceIntensity(3, 'steady')).toBeCloseTo(0.73);
  });
});

describe('speedForPower', () => {
  it('follows the road: slow uphill, fast on the flat, capped downhill, never a standstill', () => {
    const flat = speedForPower(200, 0, 80, 0.36) * 3.6;
    expect(flat).toBeGreaterThan(30);
    expect(flat).toBeLessThan(34);
    const climb = speedForPower(250, 0.07, 80, 0.36) * 3.6;
    expect(climb).toBeGreaterThan(12);
    expect(climb).toBeLessThan(15);
    expect(speedForPower(50, -0.08, 80, 0.36) * 3.6).toBeCloseTo(60);
    expect(speedForPower(5, 0.2, 80, 0.36)).toBe(1);
  });
});

describe('racePlan', () => {
  it('paces every segment, in order, and adds up', () => {
    const p = plan(hilly);
    expect(p.segments).toHaveLength(hilly.segments.length);
    expect(p.segments.map((s) => s.index)).toEqual(p.segments.map((_, i) => i + 1));
    const climbs = p.segments.filter((s) => s.kind === 'climb');
    const flats = p.segments.filter((s) => s.kind === 'flat');
    const descents = p.segments.filter((s) => s.kind === 'descent');
    // climbs above the flats, descents far below; the short ramp hardest
    expect(Math.min(...climbs.map((s) => s.target_w))).toBeGreaterThan(Math.max(...flats.map((s) => s.target_w)));
    expect(Math.max(...descents.map((s) => s.pct_ftp))).toBeLessThanOrEqual(45);
    expect(descents.some((s) => s.pct_ftp === 30)).toBe(true);
    const ramp = climbs[climbs.length - 1];
    expect(ramp.pct_ftp).toBeGreaterThan(climbs[1].pct_ftp);
    for (const s of p.segments) {
      expect(s.low_w).toBeLessThan(s.high_w);
      expect(s.low_w % 5).toBe(0);
      expect(s.duration_s).toBeGreaterThan(0);
    }
    // the clock runs through the segments
    for (let i = 1; i < p.segments.length; i += 1) {
      expect(Math.abs(p.segments[i].start_s - (p.segments[i - 1].start_s + p.segments[i - 1].duration_s))).toBeLessThanOrEqual(1);
    }
    const { summary } = p;
    expect(summary.distance_m).toBe(hilly.distance_m);
    expect(summary.gain_m).toBe(hilly.gain_m);
    expect(summary.duration_s).toBeGreaterThan(2.3 * 3600);
    expect(summary.duration_s).toBeLessThan(3.2 * 3600);
    // the plan's normalized power is the race intensity its length supports
    expect(summary.if_).toBeCloseTo(raceIntensity(summary.duration_s / 3600), 1);
    expect(summary).toMatchObject({ target_s: null, target_reachable: null });
    expect(Math.abs(summary.tss - (summary.duration_s / 3600) * summary.if_ ** 2 * 100)).toBeLessThan(4);
    expect(summary).toMatchObject({ drafting: false, effort: 'race', carbs_g_per_h: 80, fluid_ml_per_h: 600 });
    expect(summary.carbs_g).toBe(p.fueling.reduce((s, f) => s + f.carbs_g, 0));
  });

  it('rides an hour-long climb under threshold', () => {
    const p = plan(course([[5000, 0], [16000, 7], [5000, 0]]));
    const climb = p.segments.find((s) => s.kind === 'climb')!;
    expect(climb.duration_s).toBeGreaterThan(40 * 60);
    expect(climb.pct_ftp).toBeLessThan(100);
    expect(climb.pct_ftp).toBeGreaterThan(80);
  });

  it('is null without an FTP, a weight or a course to pace', () => {
    expect(racePlan(hilly, { ftp: 0, weight_kg: 72 })).toBeNull();
    expect(racePlan(hilly, { ftp: 250, weight_kg: 0 })).toBeNull();
    expect(racePlan({ ...hilly, segments: [] }, { ftp: 250, weight_kg: 72 })).toBeNull();
  });

  it('a bunch, a steady ride, a heavier bike: slower flats asked, different times', () => {
    const solo = plan(hilly);
    const bunch = plan(hilly, undefined, { drafting: true });
    expect(bunch.summary.drafting).toBe(true);
    expect(bunch.segments[0].target_w).toBeLessThan(solo.segments[0].target_w);
    const steady = plan(hilly, undefined, { effort: 'steady' });
    expect(steady.summary.effort).toBe('steady');
    expect(steady.summary.duration_s).toBeGreaterThan(solo.summary.duration_s);
    expect(steady.summary.np_w).toBeLessThan(solo.summary.np_w);
    expect(plan(hilly, undefined, { bike_kg: 14 }).summary.duration_s).toBeGreaterThan(solo.summary.duration_s);
    expect(plan(hilly, undefined, { bike_kg: 0 }).summary.duration_s).toBe(solo.summary.duration_s);
  });

  it('eats and drinks by the hour: more on a long day, more when it is hot', () => {
    const p = plan(hilly);
    expect(p.fueling.length).toBeGreaterThan(4);
    for (let i = 1; i < p.fueling.length; i += 1) expect(p.fueling[i].at_s - p.fueling[i - 1].at_s).toBeGreaterThanOrEqual(8 * 60);
    expect(p.fueling[p.fueling.length - 1].at_s).toBeLessThanOrEqual(p.summary.duration_s - 15 * 60);
    expect(p.fueling[0]).toMatchObject({ carbs_g: 27, fluid_ml: 200 });

    expect(plan(hilly, undefined, { temp_c: 30 }).summary.fluid_ml_per_h).toBe(800);
    expect(plan(hilly, undefined, { temp_c: 22 }).summary.fluid_ml_per_h).toBe(650);
    expect(plan(hilly, undefined, { temp_c: 12 }).summary.fluid_ml_per_h).toBe(500);
    expect(plan(hilly, undefined, { carbs_g_per_h: 95 }).summary.carbs_g_per_h).toBe(95);
    expect(plan(hilly, undefined, { carbs_g_per_h: 300 }).summary.carbs_g_per_h).toBe(120);
    expect(plan(hilly, undefined, { carbs_g_per_h: 0 }).summary.carbs_g_per_h).toBe(80);

    // an hour's race: little; two hours: sixty an hour
    expect(plan(course([[30000, 0]])).summary.carbs_g_per_h).toBe(30);
    expect(plan(course([[60000, 0]])).summary.carbs_g_per_h).toBe(60);
  });

  it('moves a feed off a short steep climb — ahead of it, or to its top — and keeps it on a long one', () => {
    // flat 9.5 km (about 18 min), a 3 km climb at 7 % that the 20-minute feed falls on
    const before = plan(course([[9500, 0], [3000, 7], [20000, 0]]));
    const climb = before.segments.find((s) => s.kind === 'climb')!;
    expect(before.fueling[0].moved).toBe('before_climb');
    expect(before.fueling[0].at_s).toBe(climb.start_s - 180);

    // the climb starts 5 minutes in: no room ahead of it, so at its top
    const after = plan(course([[3000, 0], [4300, 7], [20000, 0]]));
    const top = after.segments.find((s) => s.kind === 'climb')!;
    expect(top.duration_s).toBeLessThan(20 * 60);
    expect(after.fueling[0].moved).toBe('after_climb');
    expect(after.fueling[0].at_s).toBe(top.start_s + top.duration_s);

    // …unless the top is nearly the finish
    const late = plan(course([[5000, 0], [4000, 7], [6000, 0]]));
    expect(late.summary.duration_s).toBeGreaterThan(35 * 60);
    expect(late.fueling).toEqual([]);

    // a 50-minute climb is eaten on
    const long = plan(hilly);
    const big = long.segments.filter((s) => s.kind === 'climb')[1];
    expect(big.duration_s).toBeGreaterThan(20 * 60);
    expect(long.fueling.some((f) => f.moved === null && f.at_s > big.start_s && f.at_s < big.start_s + big.duration_s)).toBe(true);
  });

  it('spends the reserve on short climbs and eases the one that would empty it', () => {
    // ramps with long fast descents between them: to bring the whole ride to
    // race level the ramps go over FTP, and a small reserve does not last
    const ramps = course(RAMPS);
    const p = plan(ramps, { ftp: 250, weight_kg: 72, w_prime_j: 1000 });
    const climbs = p.segments.filter((s) => s.kind === 'climb');
    expect(climbs[0].pct_ftp).toBeGreaterThan(102);
    expect(climbs[0].w_bal_pct).toBeLessThan(100);
    expect(climbs.some((s) => s.eased)).toBe(true);
    const eased = climbs.filter((s) => s.eased);
    expect(eased[eased.length - 1].target_w).toBeLessThan(climbs[0].target_w);
    expect(Math.min(...p.segments.map((s) => s.w_bal_pct))).toBe(15);
    // the reserve comes back on what follows
    const last = p.segments[p.segments.length - 1];
    expect(last.w_bal_pct).toBeGreaterThan(15);
    // a huge reserve is capped, and is not emptied by the same ramps
    const strong = plan(ramps, { ftp: 250, weight_kg: 72, w_prime_j: 90000 });
    expect(strong.segments.every((s) => !s.eased)).toBe(true);
    // zone 5 on the ramps, zone 1 on the drops between
    expect(p.steps.some((s) => s.zone === 5)).toBe(true);
    expect(p.steps.some((s) => s.zone === 1)).toBe(true);
  });

  it('comes out as distance blocks with a cue each, cut where a feed falls', () => {
    const p = plan(hilly, undefined, { lang: 'en' });
    expect(p.steps.reduce((s, b) => s + (b.distance_m as number), 0)).toBe(hilly.distance_m);
    expect(Math.abs(p.steps.reduce((s, b) => s + b.duration_s, 0) - p.summary.duration_s)).toBeLessThan(p.steps.length);
    expect(p.steps.length).toBeGreaterThan(p.segments.length);
    const first = p.steps[0];
    expect(first).toMatchObject({ kind: 'steady', cadence: null, rep: null, reps: null });
    expect(first.target).toEqual({ unit: 'w', low: p.segments[0].low_w, high: p.segments[0].high_w });
    expect(first.cue).toMatch(/^Flat \d+\.\d km\. hold \d+-\d+ W$/);
    const climbStep = p.steps.find((s) => s.kind === 'work')!;
    expect(climbStep.cue).toMatch(/Climb \d+\.\d km at \d+\.\d%\. hold \d+-\d+ W/);
    const descentStep = p.steps.find((s) => s.kind === 'recovery')!;
    expect(descentStep.target).toBeNull();
    expect(descentStep.cue).toMatch(/Descent \d+\.\d km: recover/);
    // every feed is said at the start of a block
    expect(p.steps.filter((s) => /^Eat \d+ g carbs and drink/.test(s.cue as string))).toHaveLength(p.fueling.length);
    // a block cut out for a feed repeats the watts, not the segment's name
    expect(p.steps.some((s) => /^Eat \d+ g carbs and drink\. hold \d+-\d+ W$/.test(s.cue as string))).toBe(true);
    expect(p.steps.map((s) => s.zone).every((z) => z >= 1 && z <= 5)).toBe(true);
    expect(new Set(p.steps.map((s) => s.zone)).size).toBeGreaterThanOrEqual(3);
    expect(plan(hilly, undefined, { drafting: true }).steps.some((s) => s.zone === 2)).toBe(true);
  });

  it('speaks Russian when asked, and says when a climb was eased', () => {
    const p = plan(hilly, undefined, { lang: 'ru' });
    expect(p.steps[0].cue).toMatch(/^Ровно \d+\.\d км\. держи \d+-\d+ Вт$/);
    expect(p.steps.some((s) => /^Подъём/.test(s.cue as string))).toBe(true);
    expect(p.steps.some((s) => /Спуск \d+\.\d км: отдых/.test(s.cue as string))).toBe(true);
    expect(p.steps.some((s) => /^Съешь \d+ г углеводов и попей/.test(s.cue as string))).toBe(true);

    const ramps = course(RAMPS);
    expect(plan(ramps, { ftp: 250, weight_kg: 72, w_prime_j: 1000 }, { lang: 'ru' }).steps.some((s) => /мягче, чтобы сберечь ноги/.test(s.cue as string))).toBe(true);
    expect(plan(ramps, { ftp: 250, weight_kg: 72, w_prime_j: 1000 }).steps.some((s) => /eased to save the legs/.test(s.cue as string))).toBe(true);
  });

  it('plans for a finish time: the level of the whole effort moves, the shape stays', () => {
    const free = plan(hilly);
    const slower = plan(hilly, undefined, { target_time_min: Math.round(free.summary.duration_s / 60) + 20 });
    expect(slower.summary.target_reachable).toBe(true);
    expect(Math.abs(slower.summary.duration_s - slower.summary.target_s!)).toBeLessThanOrEqual(60);
    expect(slower.summary.np_w).toBeLessThan(free.summary.np_w);
    // every climb and flat eased, climbs still above flats
    const watts = (p: RacePlan, kind: string) => p.segments.filter((s) => s.kind === kind).map((s) => s.target_w);
    watts(slower, 'climb').forEach((w, i) => expect(w).toBeLessThan(watts(free, 'climb')[i]));
    expect(Math.min(...watts(slower, 'climb'))).toBeGreaterThan(Math.max(...watts(slower, 'flat')));
    // effort is ignored once a time is asked for
    expect(plan(hilly, undefined, { target_time_min: 200, effort: 'steady' }).summary.duration_s).toBe(plan(hilly, undefined, { target_time_min: 200 }).summary.duration_s);
    expect(plan(hilly, undefined, { target_time_min: 0 }).summary.target_s).toBeNull();
  });

  it('does not plan a time the rider cannot ride: too fast gets the fastest plan, too slow the gentlest', () => {
    const free = plan(hilly);
    const tooFast = plan(hilly, undefined, { target_time_min: 60 });
    expect(tooFast.summary).toMatchObject({ target_s: 3600, target_reachable: false });
    // the plan is the one at the ceiling over the race level — faster than the race plan, not the asked hour
    expect(tooFast.summary.duration_s).toBeLessThan(free.summary.duration_s);
    expect(tooFast.summary.duration_s).toBeGreaterThan(2 * 3600);
    expect(tooFast.summary.over_race_level).toBeCloseTo(0.08, 1);
    // a time a little under the race plan is planned, and flagged as above the level
    const brisk = plan(hilly, undefined, { target_time_min: Math.round(free.summary.duration_s / 60) - 5 });
    expect(brisk.summary.target_reachable).toBe(true);
    expect(brisk.summary.over_race_level).toBeGreaterThan(0);
    expect(free.summary.over_race_level).toBeCloseTo(0, 1);

    const tooSlow = plan(hilly, undefined, { target_time_min: 900 });
    expect(tooSlow.summary.target_reachable).toBe(false);
    expect(tooSlow.summary.duration_s).toBeGreaterThan(free.summary.duration_s);
    expect(tooSlow.summary.duration_s).toBeLessThan(900 * 60);
    expect(Math.min(...tooSlow.segments.filter((s) => s.kind !== 'descent').map((s) => s.pct_ftp))).toBe(35);
  });

  describe('arrival times along the way (splits)', () => {
    const free = plan(hilly);
    /** Seconds from the start at which a plan reaches `km`. */
    const eta = (p: RacePlan, km: number): number => {
      const seg = p.segments.find((x) => km * 1000 < x.start_m + x.distance_m)!;
      return seg.start_s + ((km * 1000 - seg.start_m) / seg.distance_m) * seg.duration_s;
    };
    const at20 = eta(free, 20) / 60;
    const finish = free.summary.duration_s / 60;

    it('rides the first part faster and the rest slower, to the minute', () => {
      const p = plan(hilly, undefined, { splits: [{ km: 20, minutes_from_start: at20 - 2 }], target_time_min: finish + 10 });
      expect(p.summary.splits).toEqual([{ km: 20, wanted_s: Math.round((at20 - 2) * 60), planned_s: expect.any(Number), ok: true }]);
      expect(p.summary.target_reachable).toBe(true);
      expect(Math.abs(p.summary.duration_s - (finish + 10) * 60)).toBeLessThanOrEqual(60);
      expect(Math.abs(eta(p, 20) - (at20 - 2) * 60)).toBeLessThanOrEqual(60);
      // the course is cut at the split: one more segment, one of them starting there
      expect(p.segments).toHaveLength(free.segments.length + 1);
      expect(p.segments.some((x) => x.start_m === 20000)).toBe(true);
      // harder before the split, easier after it
      expect(p.segments[0].target_w).toBeGreaterThan(free.segments[0].target_w);
      expect(p.segments[p.segments.length - 1].target_w).toBeLessThan(free.segments[free.segments.length - 1].target_w);
      expect(p.steps.reduce((sum, b) => sum + (b.distance_m as number), 0)).toBe(hilly.distance_m);
    });

    it('without a finish time the rest stays at the race plan level', () => {
      const p = plan(hilly, undefined, { splits: [{ km: 20, minutes_from_start: at20 - 2 }] });
      expect(p.summary.target_reachable).toBe(true);
      expect(p.summary.target_s).toBeNull();
      expect(p.segments[p.segments.length - 1].target_w).toBe(free.segments[free.segments.length - 1].target_w);
      expect(p.summary.duration_s).toBeLessThan(free.summary.duration_s - 60);
      // a finish time that is not after the last split cannot be planned for
      const early = plan(hilly, undefined, { splits: [{ km: 20, minutes_from_start: at20 - 2 }], target_time_min: 30 });
      expect(early.summary.target_reachable).toBe(false);
      expect(early.summary.duration_s).toBe(p.summary.duration_s);
    });

    it('takes a split near a segment edge at the edge, and two on one edge as one', () => {
      const edge = hilly.segments[1].start_m; // where the first climb starts
      const justAfter = plan(hilly, undefined, { splits: [{ km: (edge + 100) / 1000, minutes_from_start: 14 }] });
      expect(justAfter.segments).toHaveLength(free.segments.length);
      expect(justAfter.summary.splits[0].km).toBe(Math.round(edge / 100) / 10);
      const both = plan(hilly, undefined, {
        splits: [
          { km: (edge - 100) / 1000, minutes_from_start: 14 },
          { km: (edge + 100) / 1000, minutes_from_start: 15 },
        ],
      });
      expect(both.segments).toHaveLength(free.segments.length);
      expect(both.summary.splits).toHaveLength(1);
      expect(both.summary.splits[0].wanted_s).toBe(900);
    });

    it('drops splits that make no sense', () => {
      const messy = [{ km: 'a', minutes_from_start: 5 }, null, { km: 0.1, minutes_from_start: 5 }, { km: 500, minutes_from_start: 5 }, { km: 20, minutes_from_start: at20 }, { km: 30, minutes_from_start: at20 - 1 }];
      const p = plan(hilly, undefined, { splits: messy as never });
      expect(p.summary.splits.map((x) => x.km)).toEqual([20]);
      expect(plan(hilly, undefined, { splits: 'soon' as never }).summary.splits).toEqual([]);
      expect(plan(hilly, undefined, { splits: [] }).summary).toMatchObject({ splits: [], target_reachable: null });
    });

    it('misses a split that is out of reach instead of asking for the impossible', () => {
      const p = plan(hilly, undefined, {
        splits: [
          { km: 20, minutes_from_start: 10 },
          { km: 40, minutes_from_start: 12 },
        ],
        target_time_min: finish,
      });
      expect(p.summary.splits.map((x) => x.ok)).toEqual([false, false]);
      expect(p.summary.target_reachable).toBe(false);
      // hard, but not absurd: nothing near the 120 % limit on the way to the first split
      expect(Math.max(...p.segments.filter((x) => x.start_m < 20000).map((x) => x.pct_ftp))).toBeLessThan(112);
      // the stretch to the second split, already late, is ridden at the race plan level
      const mid = p.segments.find((x) => x.start_m >= 20000 && x.kind === 'flat')!;
      expect(mid.target_w).toBe(free.segments.find((x) => x.kind === 'flat')!.target_w);
    });
  });
});
