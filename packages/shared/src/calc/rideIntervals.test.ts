import { describe, expect, it } from 'vitest';
import { effortsOnly, intervalFacts, parseSetShape, parseWattsTarget, rideIntervals, workoutWattsTarget, type RideIntervals } from './rideIntervals.js';
import { ridePowerBreakdown } from './ridePower.js';

/** A 1 Hz ride from `[seconds, watts]` pieces; HR and cadence follow the watts. */
function ride(pieces: Array<[number, number]>) {
  const watts: number[] = [];
  for (const [seconds, w] of pieces) for (let i = 0; i < seconds; i += 1) watts.push(w);
  return {
    time: { data: watts.map((_, i) => i) },
    watts: { data: watts },
    heartrate: { data: watts.map((w) => (w > 150 ? 160 : 110)) },
    cadence: { data: watts.map((w) => (w > 150 ? 90 : 80)) },
  };
}

// 10′ warm-up, 3 × 8′ at 180 with 4′ at 90, 10′ cool-down.
const session = ride([
  [600, 100],
  [480, 182],
  [240, 90],
  [480, 180],
  [240, 90],
  [480, 178],
  [600, 80],
]);

describe('parseWattsTarget', () => {
  it('reads a range, in Latin and Cyrillic', () => {
    expect(parseWattsTarget('Intervals 170-190W')).toEqual({ low: 170, high: 190 });
    expect(parseWattsTarget('Интервалы 170 – 190 Вт')).toEqual({ low: 170, high: 190 });
    expect(parseWattsTarget('3x8 @ 200-220 watts')).toEqual({ low: 200, high: 220 });
  });

  it('turns a single figure into ±5 %', () => {
    expect(parseWattsTarget('3x8 @ 200W')).toEqual({ low: 190, high: 210 });
  });

  it('is null without watts, or with watts that make no sense', () => {
    expect(parseWattsTarget(null)).toBeNull();
    expect(parseWattsTarget('Morning Ride')).toBeNull();
    expect(parseWattsTarget('Ride 20-30 with friends')).toBeNull();
    expect(parseWattsTarget('190-170W')).toBeNull();
    expect(parseWattsTarget('20W bulb')).toBeNull();
    expect(parseWattsTarget('100 west street')).toBeNull();
  });
});

describe('parseSetShape', () => {
  it('reads repetitions and the length of one effort', () => {
    expect(parseSetShape('3x8′ 150-170W Intervals')).toEqual({ reps: 3, duration_s: 480 });
    expect(parseSetShape('4×5 min VO2')).toEqual({ reps: 4, duration_s: 300 });
    expect(parseSetShape('3х8 мин')).toEqual({ reps: 3, duration_s: 480 });
    expect(parseSetShape('10x30s sprints')).toEqual({ reps: 10, duration_s: 30 });
    expect(parseSetShape('8 x 40 сек')).toEqual({ reps: 8, duration_s: 40 });
    expect(parseSetShape('3x8')).toEqual({ reps: 3, duration_s: 480 });
  });

  it('is null without a set, or with one that makes no sense', () => {
    expect(parseSetShape(null)).toBeNull();
    expect(parseSetShape('Morning Ride')).toBeNull();
    expect(parseSetShape('1x20 min')).toBeNull();
    expect(parseSetShape('3x5s')).toBeNull();
    expect(parseSetShape('2x90 min')).toBeNull();
  });
});

describe('workoutWattsTarget', () => {
  const step = (kind: string, duration_s: number, low?: number, high?: number, unit = 'w') => ({
    kind,
    duration_s,
    target: low ? { unit, low, high: high as number } : null,
  });

  it('takes the range most work time is planned at', () => {
    const workout = {
      steps: [step('warmup', 600, 90, 110), step('work', 480, 170, 190), step('recovery', 240), step('work', 480, 170, 190), step('work', 60, 300, 320)],
    };
    expect(workoutWattsTarget(workout)).toEqual({ low: 170, high: 190, source: 'plan', planned: { reps: 2, duration_s: 480 } });
  });

  it('falls back to steady blocks, and is null without a watts target', () => {
    expect(workoutWattsTarget({ steps: [step('steady', 3600, 120, 140)] })).toEqual({ low: 120, high: 140, source: 'plan', planned: { reps: 1, duration_s: 3600 } });
    expect(workoutWattsTarget({ steps: [step('work', 480, 150, 160, 'bpm'), step('work', 480)] })).toBeNull();
    expect(workoutWattsTarget(null)).toBeNull();
    expect(workoutWattsTarget({})).toBeNull();
  });
});

describe('rideIntervals', () => {
  it('finds the three efforts of a 3 × 8′ session and the set they form', () => {
    const r = rideIntervals(session, { ftp: 200 });
    expect(r).not.toBeNull();
    expect(r?.blocks.map((b) => [b.start_s, b.duration_s, b.avg_w])).toEqual([
      [600, 480, 182],
      [1320, 480, 180],
      [2040, 480, 178],
    ]);
    const first = r?.blocks[0];
    expect(first).toMatchObject({
      index: 1,
      max_w: 182,
      avg_hr: 160,
      max_hr: 160,
      avg_cadence: 90,
      cv_pct: 0,
      pct_ftp: 91,
      in_target_pct: null,
      vs_target: null,
      rest_after_s: 240,
      rest_after_w: 90,
    });
    expect(r?.blocks[2].rest_after_s).toBeNull();
    expect(r?.blocks[2].rest_after_w).toBeNull();
    expect(r?.set).toEqual({
      reps: 3,
      blocks: [1, 2, 3],
      duration_s: 480,
      rest_s: 240,
      avg_w: 180,
      first_w: 182,
      last_w: 178,
      fade_pct: -2.2,
      spread_pct: 2.2,
      hits: null,
    });
    expect(r?.work_s).toBe(1440);
    expect(r?.work_avg_w).toBe(180);
    expect(r?.target).toBeNull();
    expect(r?.threshold_w).toBeGreaterThan(100);
    expect(r?.threshold_w).toBeLessThan(178);
  });

  it('reads the blocks against a target', () => {
    const r = rideIntervals(session, { target: { low: 170, high: 190, source: 'name' } });
    expect(r?.threshold_w).toBe(153);
    expect(r?.blocks.map((b) => b.vs_target)).toEqual(['in', 'in', 'in']);
    expect(r?.blocks.map((b) => b.in_target_pct)).toEqual([100, 100, 100]);
    expect(r?.blocks[0].pct_ftp).toBeNull();
    expect(r?.set?.hits).toBe(3);

    const high = rideIntervals(session, { target: { low: 150, high: 179, source: 'plan' } });
    expect(high?.blocks.map((b) => b.vs_target)).toEqual(['above', 'above', 'in']);
    expect(high?.set?.hits).toBe(1);
  });

  it('still finds the efforts when they were ridden far under the target', () => {
    const r = rideIntervals(session, { target: { low: 260, high: 280, source: 'plan' } });
    expect(r?.blocks).toHaveLength(3);
    expect(r?.blocks.map((b) => b.vs_target)).toEqual(['below', 'below', 'below']);
    expect(r?.set?.hits).toBe(0);
  });

  it('has nothing to say about a ride at one level, or without a meter', () => {
    expect(rideIntervals(ride([[3600, 150]]))).toBeNull();
    expect(rideIntervals(ride([[3600, 150]]), { target: { low: 300, high: 320, source: 'name' } })).toBeNull();
    // Two levels, but too close to call work and rest.
    expect(rideIntervals(ride([[1800, 150], [1800, 165]]))).toBeNull();
    expect(rideIntervals(ride([[600, 0]]))).toBeNull();
    expect(rideIntervals({ time: { data: [0, 1] } })).toBeNull();
    expect(rideIntervals(null)).toBeNull();
  });

  it('an effort ridden just above the threshold, sagging under it, stays one block', () => {
    // 3 × 8′ against 150–170 W: the first at ~142 W dipping to 128 W for 40 s twice.
    const r = rideIntervals(
      ride([[600, 90], [150, 142], [40, 128], [150, 142], [40, 128], [100, 142], [240, 80], [480, 160], [240, 80], [480, 168], [600, 80]]),
      { target: { low: 150, high: 170, source: 'name' } },
    );
    expect(r?.threshold_w).toBe(135);
    expect(r?.blocks.map((b) => [b.duration_s, b.avg_w, b.vs_target])).toEqual([
      [480, 140, 'below'],
      [480, 160, 'in'],
      [480, 168, 'in'],
    ]);
    expect(r?.set).toMatchObject({ reps: 3, hits: 2 });
  });

  it('two long efforts far apart are efforts, not a set — unless the ride names a target', () => {
    // Two climbs of ~11 min, half an hour of valley between them.
    const climbs = ride([[600, 80], [700, 137], [1900, 70], [600, 126], [600, 70]]);
    const r = rideIntervals(climbs);
    expect(r?.blocks.map((b) => b.avg_w)).toEqual([137, 126]);
    expect(r?.set).toBeNull();
    expect(rideIntervals(climbs, { target: { low: 120, high: 140, source: 'name' } })?.set?.reps).toBe(2);
    // Sprint sets rest many times their length and stay a set.
    const sprints = ride([[300, 80], [40, 400], [300, 80], [40, 400], [300, 80], [40, 400], [300, 80]]);
    expect(rideIntervals(sprints)?.set?.reps).toBe(3);
  });

  it('a single effort is a block without a set', () => {
    const r = rideIntervals(ride([[600, 100], [1200, 220], [600, 100]]));
    expect(r?.blocks).toHaveLength(1);
    expect(r?.set).toBeNull();

    // A ride held above the target's threshold from the first second to the last is one block.
    const whole = rideIntervals(ride([[1200, 160]]), { target: { low: 150, high: 170, source: 'name' } });
    expect(whole?.blocks.map((b) => [b.start_s, b.duration_s, b.vs_target])).toEqual([[0, 1200, 'in']]);
  });

  it('takes the harder level as the work when a tempo warm-up runs into the efforts', () => {
    const r = rideIntervals(ride([[600, 60], [900, 150], [300, 250], [300, 60], [300, 250], [300, 60], [300, 250], [600, 60]]));
    expect(r?.blocks.map((b) => b.avg_w)).toEqual([250, 250, 250]);
    expect(r?.blocks[0].start_s).toBe(1500);
  });

  it('bridges a short dip, drops a surge, and cuts stops out of heart rate', () => {
    const r = rideIntervals(ride([[300, 100], [200, 250], [6, 0], [200, 250], [300, 100], [12, 400], [300, 100]]));
    expect(r?.blocks).toHaveLength(1);
    expect(r?.blocks[0].duration_s).toBe(406);

    // A stop in the middle of the file: time jumps, the seconds in between carry no samples.
    const watts = [...new Array(300).fill(100), ...new Array(300).fill(250), ...new Array(300).fill(100)];
    const time = watts.map((_, i) => (i < 600 ? i : i + 600));
    const stopped = rideIntervals({ time: { data: time }, watts: { data: watts.map((w, i) => (i === 10 ? null : w)) }, heartrate: { data: watts.map(() => 0) } });
    expect(stopped?.blocks).toHaveLength(1);
    expect(stopped?.blocks[0]).toMatchObject({ start_s: 300, duration_s: 300, avg_hr: null, max_hr: null, avg_cadence: null });

    // A few seconds without samples inside an effort do not split it, and carry no heart rate.
    const paused = rideIntervals({
      time: { data: watts.map((_, i) => (i < 450 ? i : i + 8)) },
      watts: { data: watts },
      heartrate: { data: watts.map(() => 150) },
    });
    expect(paused?.blocks).toHaveLength(1);
    expect(paused?.blocks[0]).toMatchObject({ start_s: 300, duration_s: 308, avg_hr: 150 });
  });

  it('works without a time stream and lists at most 20 blocks', () => {
    const pieces: Array<[number, number]> = [];
    for (let i = 0; i < 25; i += 1) pieces.push([i < 3 ? 40 : 60, 300], [60, 100]);
    const streams = ride(pieces);
    const r = rideIntervals({ watts: streams.watts });
    expect(r?.blocks).toHaveLength(20);
    // The three shortest (the first three) are the ones left out.
    expect(r?.blocks[0].start_s).toBe(300);
    expect(r?.set?.reps).toBe(20);
  });
});

describe('ridePowerBreakdown with intervals', () => {
  it('carries the blocks and drops the half-vs-half fade on a set', () => {
    const r = ridePowerBreakdown(session, { ftp: 200, target: { low: 170, high: 190, source: 'name' } });
    expect(r.intervals?.set?.reps).toBe(3);
    expect(r.intervals?.target?.source).toBe('name');
    expect(r.fade).toBeNull();
  });
});

describe('intervalFacts', () => {
  it('states the set, the target and the heart rate', () => {
    const r = rideIntervals(session, { target: { low: 170, high: 190, source: 'plan', planned: { reps: 3, duration_s: 480 } } }) as RideIntervals;
    expect(intervalFacts(r)).toEqual([
      'Interval set: 3 × 8:00 at 180 W on average (182 / 180 / 178 W), rests of about 4:00.',
      'Last effort vs first: -2.2 % — held evenly across the set.',
      'Target 170–190 W (from the planned session): 3 of 3 efforts averaged inside it; share of each effort ridden inside the range: 100 / 100 / 100 %.',
      'Planned 3 × 8:00; ridden 3 × 8:00.',
      'Heart rate per effort: 160 / 160 / 160 bpm.',
    ]);
  });

  it('says which way the efforts missed and how the set moved', () => {
    const faded = rideIntervals(ride([[300, 80], [300, 260], [200, 80], [300, 240], [300, 80]]), { target: { low: 245, high: 255, source: 'name' } }) as RideIntervals;
    const facts = intervalFacts(faded);
    expect(facts[1]).toBe('Last effort vs first: -7.7 % — faded across the set.');
    expect(facts[2]).toContain("from the ride's name): 0 of 2 efforts averaged inside it (1 below, 1 above)");

    const built = rideIntervals(ride([[300, 80], [300, 240], [200, 80], [300, 260], [300, 80]])) as RideIntervals;
    expect(intervalFacts(built)[1]).toBe('Last effort vs first: +8.3 % — built across the set.');
  });

  it('describes efforts that form no set', () => {
    const one = rideIntervals(ride([[600, 100], [1200, 220], [600, 100]]), { target: { low: 210, high: 230, source: 'plan', planned: { reps: 1, duration_s: 1200 } } }) as RideIntervals;
    const facts = intervalFacts(one);
    expect(facts[0]).toMatch(/^1 distinct effort above \d+ W, no repeated set; the longest is 20:00 at 220 W\.$/);
    expect(facts[2]).toBe('Planned 1 × 20:00; ridden 1 × 20:00.');

    const three = rideIntervals({ watts: ride([[300, 80], [120, 200], [300, 80], [600, 300], [300, 80], [300, 260], [300, 80]]).watts }) as RideIntervals;
    const lines = intervalFacts(three);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^3 distinct efforts above \d+ W, no repeated set; the longest is 10:00 at 300 W\.$/);
  });
});

describe('effortsOnly', () => {
  // A Zone 2 spin: two slightly less easy stretches.
  const easy = ride([[1200, 75], [268, 125], [300, 75], [250, 122], [1200, 75]]);

  it('an easy ride has no blocks once the FTP says they were easy', () => {
    const found = rideIntervals(easy, { ftp: 183 });
    expect(found?.blocks.map((b) => b.avg_w)).toEqual([125, 122]);
    expect(effortsOnly(found, 183)).toBeNull();
    expect(ridePowerBreakdown(easy, { ftp: 183 }).intervals).toBeNull();
    // the same stretches are efforts for a rider whose FTP is 140
    expect(effortsOnly(found, 140)).toBe(found);
    expect(ridePowerBreakdown(easy, { ftp: 140 }).intervals?.blocks).toHaveLength(2);
  });

  it('leaves alone a ride with a target, a ride without an FTP, and nothing', () => {
    const named = rideIntervals(easy, { ftp: 183, target: { low: 115, high: 130, source: 'name' } });
    expect(effortsOnly(named, 183)).toBe(named);
    const found = rideIntervals(easy);
    expect(effortsOnly(found, null)).toBe(found);
    expect(effortsOnly(found, 0)).toBe(found);
    expect(effortsOnly(null, 183)).toBeNull();
  });
});
