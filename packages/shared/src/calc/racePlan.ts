/**
 * A race plan for a course and a rider: what to hold on every climb, flat
 * and descent, how long each should take, where the anaerobic reserve (W′)
 * stands after it, and when to eat and drink — plus the same thing as
 * distance-based workout blocks a head unit can run (calendar/workout.ts,
 * services/garminWorkoutFit.js).
 *
 * The pacing is the textbook one, stated so the coach can explain it:
 *  - the whole race is ridden at an intensity its length allows (an hour
 *    near threshold, five hours at endurance pace) — the plan's normalized
 *    power is brought to exactly that, or to what a target time needs;
 *  - climbs get more than that — the shorter the climb the more — because a
 *    watt buys the most time where the speed is low; descents get almost
 *    nothing; flats sit a little under the race's level (well under it in a
 *    bunch);
 *  - what is spent above FTP comes out of W′ and comes back slowly below it
 *    (Skiba's W′ balance); a climb that would empty the reserve is eased
 *    until it does not.
 * Speeds come from the usual road-cycling power equation (gravity, rolling
 * resistance, air), so the time per segment follows from the watts.
 */
import type { Course, CourseSegment, CourseSegmentKind } from './course.js';
import type { WorkoutStep, WorkoutStepKind } from '../types/calendar.js';

export interface RacePlanRider {
  ftp: number;
  /** Rider's weight, kg. */
  weight_kg: number;
  /** Anaerobic work capacity, joules (critical-power fit); a typical value is assumed without one. */
  w_prime_j?: number | null;
}

export interface RacePlanOptions {
  /** Riding in a bunch: less air to push on flats and descents, and less work asked for there. */
  drafting?: boolean;
  /** 'race' — as fast as the length allows (default); 'steady' — a hard ride finished with something left. */
  effort?: 'race' | 'steady';
  /** Grams of carbohydrate per hour; chosen from the race's length when absent. */
  carbs_g_per_h?: number | null;
  /** Air temperature, °C — sets how much to drink. */
  temp_c?: number | null;
  bike_kg?: number | null;
  /** Language of the block cues. */
  lang?: 'en' | 'ru';
  /**
   * A finish time to plan for, minutes. The level of the whole effort is set
   * so the plan takes this long; `effort` is then ignored. A time that asks
   * for more than the race level is planned and flagged
   * (`summary.over_race_level`); one out of reach is not
   * (`summary.target_reachable`).
   */
  target_time_min?: number | null;
  /**
   * Arrival times wanted along the way — "36 km in 1:55" — in riding order.
   * Each stretch between two of them is paced for its own time, so the first
   * part of a race can be ridden harder and the rest easier. With
   * `target_time_min` the last stretch is paced for the finish time;
   * without it, at the race plan's level.
   */
  splits?: Array<{ km: number; minutes_from_start: number }> | null;
}

export interface RacePlanSegment extends CourseSegment {
  index: number;
  /** Watts to hold, as a range, and the middle of it. */
  target_w: number;
  low_w: number;
  high_w: number;
  /** Share of FTP, percent. */
  pct_ftp: number;
  speed_kmh: number;
  duration_s: number;
  /** Seconds from the start when the segment begins. */
  start_s: number;
  /** W′ left at the end of the segment, percent. */
  w_bal_pct: number;
  /** True when the climb was eased to keep the reserve from running out. */
  eased: boolean;
}

export interface FuelingEvent {
  /** Seconds and metres from the start. */
  at_s: number;
  at_m: number;
  carbs_g: number;
  fluid_ml: number;
  /** Moved off a steep climb: to just before it, or to its top. */
  moved: 'before_climb' | 'after_climb' | null;
}

export interface RacePlan {
  summary: {
    distance_m: number;
    gain_m: number;
    duration_s: number;
    avg_speed_kmh: number;
    np_w: number;
    if_: number;
    tss: number;
    carbs_g_per_h: number;
    fluid_ml_per_h: number;
    carbs_g: number;
    fluid_ml: number;
    drafting: boolean;
    effort: 'race' | 'steady';
    /** The finish time asked for, seconds; null when none was. */
    target_s: number | null;
    /** False when the asked time is out of reach — faster than the ceiling above the race level, or slower than the gentlest plan; the plan is then the nearest one. Null without a target. */
    target_reachable: boolean | null;
    /** The plan's IF minus the race level of its length: about 0 for a race plan, negative for an easier one, positive when a target time asks for more than most riders hold that long. */
    over_race_level: number;
    /** The arrival times asked for and what the plan gives: `ok` within a minute. Empty without `splits`. */
    splits: Array<{ km: number; wanted_s: number; planned_s: number; ok: boolean }>;
  };
  segments: RacePlanSegment[];
  fueling: FuelingEvent[];
  /** The plan as workout blocks: one per segment, split where a feed falls inside it. */
  steps: WorkoutStep[];
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.2;
const ROLLING = 0.005;
const DRIVETRAIN = 0.975;
const CDA_SOLO = 0.36;
/** Share of the solo drag left when sitting in a bunch. */
const DRAFT_SHARE = 0.72;
const DEFAULT_BIKE_KG = 8;
/** No plan counts on descending faster than this, m/s (60 km/h). */
const MAX_SPEED_MS = 60 / 3.6;
const DEFAULT_W_PRIME_J = 15000;
/** The reserve is never planned below this share. */
const W_PRIME_FLOOR = 0.15;
/** No climb or flat is planned outside these shares of FTP, whatever the scale. */
const MIN_SHARE = 0.35;
const MAX_SHARE = 1.2;
/** Range of the level scale searched. */
const SCALE_MIN = 0.3;
const SCALE_MAX = 1.6;
/** A target time may ask for this much more than the race level (as IF) before it is out of reach. */
const RACE_LEVEL_CEILING = 0.08;
/** A plan within this many seconds of the asked time is that time. */
const TARGET_TOLERANCE_S = 60;
/** A feed every this many seconds, the first one this far in, none this close to the finish. */
const FEED_EVERY_S = 20 * 60;
const FEED_END_MARGIN_S = 15 * 60;
/** A feed is moved off a climb at least this steep (when the climb is short). */
const FEED_MAX_GRADE_PCT = 4;
const FEED_MIN_GAP_S = 8 * 60;
/** A steep climb up to this long is waited out; the feed moves this far ahead of it, or to its top. */
const FEED_SHORT_CLIMB_S = 20 * 60;
const FEED_BEFORE_CLIMB_S = 3 * 60;
/** A feed this close to a segment's edge is said at the edge. */
const FEED_SNAP_M = 300;

const round5 = (n: number): number => Math.round(n / 5) * 5;

/** Race intensity (share of FTP, as normalized power) a ride of `hours` supports. */
export function raceIntensity(hours: number, effort: 'race' | 'steady' = 'race'): number {
  const curve: Array<[number, number]> = [
    [1, 0.92],
    [2, 0.85],
    [3, 0.8],
    [4, 0.76],
    [5, 0.72],
  ];
  let value = curve[curve.length - 1][1];
  if (hours <= curve[0][0]) value = curve[0][1];
  else {
    for (let i = 1; i < curve.length; i += 1) {
      if (hours <= curve[i][0]) {
        const [h0, v0] = curve[i - 1];
        const [h1, v1] = curve[i];
        value = v0 + ((v1 - v0) * (hours - h0)) / (h1 - h0);
        break;
      }
    }
  }
  return effort === 'steady' ? value - 0.07 : value;
}

/**
 * What a climb of this many minutes can be ridden at, as a share of FTP:
 * 1.15 up to 3 minutes, 1.08 at 8, 1.0 at 20, 0.95 at 40, 0.9 from an hour
 * on — a straight line between those. Continuous on purpose: the level of
 * the plan is solved by bisection, and a step here is a jump in the plan's
 * time that no scale can land on.
 */
function climbShare(minutes: number): number {
  const knots: Array<[number, number]> = [
    [3, 1.15],
    [8, 1.08],
    [20, 1.0],
    [40, 0.95],
    [60, 0.9],
  ];
  if (minutes <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i += 1) {
    if (minutes <= knots[i][0]) {
      const [m0, v0] = knots[i - 1];
      const [m1, v1] = knots[i];
      return v0 + ((v1 - v0) * (minutes - m0)) / (m1 - m0);
    }
  }
  return knots[knots.length - 1][1];
}

/** Speed (m/s) that `watts` hold on `grade` (a fraction), by bisection on the power equation. */
export function speedForPower(watts: number, grade: number, massKg: number, cda: number): number {
  const slope = Math.atan(grade);
  const resist = massKg * GRAVITY * (Math.sin(slope) + ROLLING * Math.cos(slope));
  const need = (v: number): number => (resist * v + 0.5 * AIR_DENSITY * cda * v ** 3) / DRIVETRAIN;
  if (need(MAX_SPEED_MS) <= watts) return MAX_SPEED_MS;
  let lo = 0;
  let hi = MAX_SPEED_MS;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (need(mid) > watts) hi = mid;
    else lo = mid;
  }
  // Never slower than a walk: a plan must not come out with an hour for a ramp.
  return Math.max(lo, 1);
}

/** Coggan zone of a share of FTP — 1 to 5: no segment is planned above 115 %. */
function zoneOf(share: number): number {
  if (share < 0.55) return 1;
  if (share < 0.75) return 2;
  if (share < 0.9) return 3;
  if (share < 1.05) return 4;
  return 5;
}

const STEP_KIND: Record<CourseSegmentKind, WorkoutStepKind> = { climb: 'work', flat: 'steady', descent: 'recovery' };

const TEXT = {
  en: {
    climb: (km: string, grade: string) => `Climb ${km} km at ${grade}%`,
    flat: (km: string) => `Flat ${km} km`,
    descent: (km: string) => `Descent ${km} km: recover`,
    hold: (low: number, high: number) => `hold ${low}-${high} W`,
    eat: (g: number) => `Eat ${g} g carbs and drink`,
    eased: 'eased to save the legs',
  },
  ru: {
    climb: (km: string, grade: string) => `Подъём ${km} км, ${grade}%`,
    flat: (km: string) => `Ровно ${km} км`,
    descent: (km: string) => `Спуск ${km} км: отдых`,
    hold: (low: number, high: number) => `держи ${low}-${high} Вт`,
    eat: (g: number) => `Съешь ${g} г углеводов и попей`,
    eased: 'мягче, чтобы сберечь ноги',
  },
};

/** A split closer than this to a segment's edge, or to the start, is taken at the edge. */
const SPLIT_SNAP_M = 200;

/**
 * The course's segments cut at the asked arrival points, and where each
 * point falls: the index of the first segment after it and the seconds from
 * the start wanted there. Splits that are not numbers, not past the start,
 * at or past the finish, or not later than the one before are dropped.
 */
function cutAtSplits(
  course: Course,
  splits: RacePlanOptions['splits'],
): { work: CourseSegment[]; cuts: Array<{ index: number; seconds: number; km: number }> } {
  const work = course.segments.map((seg) => ({ ...seg }));
  const cuts: Array<{ index: number; seconds: number; km: number }> = [];
  let lastM = SPLIT_SNAP_M;
  let lastS = 0;
  for (const split of Array.isArray(splits) ? splits : []) {
    const metres = Number(split?.km) * 1000;
    const seconds = Number(split?.minutes_from_start) * 60;
    if (!(metres > lastM) || !(metres < course.distance_m - SPLIT_SNAP_M) || !(seconds > lastS)) continue;
    let i = work.findIndex((seg) => metres < seg.start_m + seg.distance_m);
    const seg = work[i];
    if (metres - seg.start_m >= SPLIT_SNAP_M && seg.start_m + seg.distance_m - metres >= SPLIT_SNAP_M) {
      // Cut the segment in two at the split.
      const share = (metres - seg.start_m) / seg.distance_m;
      const first = { ...seg, distance_m: Math.round(metres - seg.start_m), gain_m: Math.round(seg.gain_m * share) };
      const second = { ...seg, start_m: Math.round(metres), distance_m: seg.distance_m - first.distance_m, gain_m: seg.gain_m - first.gain_m };
      work.splice(i, 1, first, second);
      i += 1;
    } else if (metres - seg.start_m >= SPLIT_SNAP_M) {
      i += 1; // close to the segment's end: the split is the next segment's start
    }
    // Two splits that land on one boundary are one split: the later time wins.
    if (cuts.length && cuts[cuts.length - 1].index === i) cuts.pop();
    cuts.push({ index: i, seconds, km: Math.round(work[i].start_m / 100) / 10 });
    lastM = metres;
    lastS = seconds;
  }
  return { work, cuts };
}

/**
 * The plan. Null when there is nothing to pace with (no FTP or weight) or
 * nothing to pace (a course without segments).
 */
export function racePlan(course: Course, rider: RacePlanRider, options: RacePlanOptions = {}): RacePlan | null {
  const { ftp } = rider;
  if (!(ftp > 0) || !(rider.weight_kg > 0) || course.segments.length === 0) return null;
  const effort = options.effort === 'steady' ? 'steady' : 'race';
  const drafting = options.drafting === true;
  const mass = rider.weight_kg + (options.bike_kg && options.bike_kg > 0 ? options.bike_kg : DEFAULT_BIKE_KG);
  const wPrime = rider.w_prime_j && rider.w_prime_j > 0 ? Math.min(30000, Math.max(8000, rider.w_prime_j)) : DEFAULT_W_PRIME_J;
  const cdaFor = (kind: CourseSegmentKind): number => (drafting && kind !== 'climb' ? CDA_SOLO * DRAFT_SHARE : CDA_SOLO);

  // Arrival times asked for along the way (`splits`): the course's segments
  // are cut at those points, so each stretch can be paced on its own.
  const { work, cuts } = cutAtSplits(course, options.splits);

  // The SHAPE of the effort — climbs over flats over descents — comes from
  // the tables above; its LEVEL is one scale factor on every climb and flat,
  // solved so that the whole plan comes out where it should:
  //  - without a target time, the plan's normalized power equals the race
  //    intensity its length supports. (Shares alone do not guarantee that:
  //    on a hilly course the climbs are most of the clock, and unscaled the
  //    plan would ask for threshold work for three hours.)
  //  - with a target time, the plan takes exactly that long — as long as
  //    that is not faster than the race intensity allows.
  const shareFor = (seg: CourseSegment, base: number, minutes: number): number => {
    if (seg.kind === 'flat') return base - (drafting ? 0.15 : 0.03);
    return Math.min(climbShare(minutes), base + 0.25);
  };
  type Ride = { shares: number[]; seconds: number; intensity: number; scale: number; base: number };
  /** `segs` ridden at scale `k`: each segment's share of FTP, the time they take and their NP as a share of FTP. */
  const ride = (segs: readonly CourseSegment[], base: number, k: number): Ride => {
    let seconds = 0;
    let fourth = 0;
    const shares = segs.map((seg) => {
      let share: number;
      if (seg.kind === 'descent') {
        share = seg.grade_pct <= -5 ? 0.3 : 0.45;
      } else {
        // A climb's own length sets its share: one pass with the race's level, then with its own.
        share = shareFor(seg, base, 0) * k;
        for (let i = 0; i < 2; i += 1) {
          const v = speedForPower(share * ftp, seg.grade_pct / 100, mass, cdaFor(seg.kind));
          share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, shareFor(seg, base, seg.distance_m / v / 60) * k));
        }
      }
      const duration = seg.distance_m / speedForPower(share * ftp, seg.grade_pct / 100, mass, cdaFor(seg.kind));
      seconds += duration;
      fourth += share ** 4 * duration;
      return share;
    });
    return { shares, seconds, intensity: (fourth / seconds) ** 0.25, scale: k, base };
  };
  /** The scale at which `value(ride)` reaches `goal`, by bisection; `value` must grow with the scale. */
  const solve = (segs: readonly CourseSegment[], base: number, goal: number, value: (r: Ride) => number): Ride => {
    let lo = SCALE_MIN;
    let hi = SCALE_MAX;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      if (value(ride(segs, base, mid)) < goal) lo = mid;
      else hi = mid;
    }
    return ride(segs, base, (lo + hi) / 2);
  };
  /** Faster is "more negative seconds": −seconds grows with the scale. */
  const inTime = (segs: readonly CourseSegment[], base: number, seconds: number): Ride => solve(segs, base, -seconds, (r) => -r.seconds);
  /** The plan whose normalized power is the race intensity of its own length plus `over`: length and level settle together. */
  const atRaceLevel = (level: 'race' | 'steady', over = 0): Ride => {
    let hours = course.distance_m / 1000 / 28;
    let result = ride(work, raceIntensity(hours, level), 1);
    for (let pass = 0; pass < 4; pass += 1) {
      const base = raceIntensity(hours, level);
      result = solve(work, base, base + over, (r) => r.intensity);
      hours = result.seconds / 3600;
    }
    return result;
  };
  const targetS = options.target_time_min && options.target_time_min > 0 ? options.target_time_min * 60 : null;
  const free = atRaceLevel(effort);
  let shares = free.shares;
  let targetReachable: boolean | null = null;
  if (cuts.length > 0) {
    // Arrival times along the way: each stretch between two of them is
    // solved for its own time (ride the first part harder, the rest easier),
    // the stretch after the last one for the finish time — or left at the
    // race plan's level when no finish time was asked for.
    const finishS = targetS !== null && targetS > cuts[cuts.length - 1].seconds ? targetS : null;
    const base = raceIntensity((finishS ?? free.seconds) / 3600, 'race');
    // A stretch is paced for the time left until its arrival time, counted
    // from when the plan actually gets to its start: a split that cannot be
    // met (too early for the legs) does not make everything after it crawl
    // to give the minutes back. With no time left, it is ridden at the race
    // plan's level.
    // And no stretch is asked for more than the ceiling over the race level
    // of its own length: an arrival time that needs it is simply missed.
    const paced = (segs: readonly CourseSegment[], until: number | null, clockS: number): Ride => {
      if (until === null || until - clockS <= TARGET_TOLERANCE_S) return ride(segs, free.base, free.scale);
      const timed = inTime(segs, base, until - clockS);
      const cap = raceIntensity(timed.seconds / 3600, 'race') + RACE_LEVEL_CEILING;
      return timed.intensity > cap ? solve(segs, base, cap, (r) => r.intensity) : timed;
    };
    shares = [];
    let from = 0;
    let clockS = 0;
    for (const cut of cuts) {
      const part = paced(work.slice(from, cut.index), cut.seconds, clockS);
      shares.push(...part.shares);
      from = cut.index;
      clockS += part.seconds;
    }
    shares.push(...paced(work.slice(from), finishS, clockS).shares);
  } else if (targetS !== null) {
    const timed = inTime(work, raceIntensity(targetS / 3600, 'race'), targetS);
    // The race level is what most riders hold, not a wall: a time that asks
    // for more is planned — and reported as above the level, see
    // `summary.over_race_level` — up to RACE_LEVEL_CEILING over it. Past
    // that the plan is the one at the ceiling, and says the time is out of
    // reach. A time slower than the gentlest plan (MIN_SHARE everywhere)
    // gets that gentlest plan, and says so too.
    const ceiling = atRaceLevel('race', RACE_LEVEL_CEILING);
    const tooFast = timed.seconds < ceiling.seconds - TARGET_TOLERANCE_S;
    shares = (tooFast ? ceiling : timed).shares;
    targetReachable = !tooFast && Math.abs(timed.seconds - targetS) <= TARGET_TOLERANCE_S;
  }

  // Ride it once, in order, keeping the W′ account.
  let balance = wPrime;
  let clock = 0;
  let fourth = 0;
  const segments: RacePlanSegment[] = work.map((seg, index) => {
    let watts = shares[index] * ftp;
    let speed = speedForPower(watts, seg.grade_pct / 100, mass, cdaFor(seg.kind));
    let duration = seg.distance_m / speed;
    let eased = false;
    if (watts > ftp && balance - (watts - ftp) * duration < wPrime * W_PRIME_FLOOR) {
      // Ease to what the reserve allows over this climb, never under FTP.
      watts = ftp + Math.max(0, balance - wPrime * W_PRIME_FLOOR) / duration;
      speed = speedForPower(watts, seg.grade_pct / 100, mass, cdaFor(seg.kind));
      duration = seg.distance_m / speed;
      eased = true;
    }
    if (watts > ftp) {
      balance = Math.max(wPrime * W_PRIME_FLOOR, balance - (watts - ftp) * duration);
    } else {
      const tau = 546 * Math.exp(-0.01 * (ftp - watts)) + 316;
      balance = wPrime - (wPrime - balance) * Math.exp(-duration / tau);
    }
    const start_s = Math.round(clock);
    clock += duration;
    fourth += watts ** 4 * duration;
    const target = round5(watts);
    return {
      ...seg,
      index: index + 1,
      target_w: target,
      low_w: round5(watts * 0.95),
      high_w: Math.max(round5(watts * 1.05), round5(watts * 0.95) + 5),
      pct_ftp: Math.round((watts / ftp) * 100),
      speed_kmh: Math.round(speed * 36) / 10,
      duration_s: Math.round(duration),
      start_s,
      w_bal_pct: Math.round((balance / wPrime) * 100),
      eased,
    };
  });
  const total = clock;
  const totalHours = total / 3600;
  const splitResults = cuts.map((cut) => {
    const planned = segments[cut.index].start_s;
    return { km: cut.km, wanted_s: Math.round(cut.seconds), planned_s: planned, ok: Math.abs(planned - cut.seconds) <= TARGET_TOLERANCE_S };
  });
  if (cuts.length > 0) {
    targetReachable = splitResults.every((r) => r.ok) && (targetS === null || Math.abs(total - targetS) <= TARGET_TOLERANCE_S);
  }
  const np = (fourth / total) ** 0.25;
  const intensity = np / ftp;

  // Fuel: by the hour, taken every 20 minutes, never on a steep climb.
  const carbsPerHour =
    options.carbs_g_per_h && options.carbs_g_per_h > 0
      ? Math.min(120, Math.round(options.carbs_g_per_h))
      : totalHours < 1.25
      ? 30
      : totalHours < 2.5
      ? 60
      : 80;
  const temp = options.temp_c;
  const fluidPerHour = typeof temp !== 'number' ? 600 : temp >= 28 ? 800 : temp >= 20 ? 650 : 500;
  const segmentAt = (s: number): RacePlanSegment => {
    let i = 0;
    while (i + 1 < segments.length && s >= segments[i].start_s + segments[i].duration_s) i += 1;
    return segments[i];
  };
  const metresAt = (s: number): number => {
    const seg = segmentAt(s);
    return Math.round(seg.start_m + Math.min(1, Math.max(0, (s - seg.start_s) / seg.duration_s)) * seg.distance_m);
  };
  const fueling: FuelingEvent[] = [];
  for (let t = FEED_EVERY_S; t <= total - FEED_END_MARGIN_S; t += FEED_EVERY_S) {
    const seg = segmentAt(t);
    const previous = fueling.length ? fueling[fueling.length - 1].at_s : 0;
    let at = t;
    let moved: FuelingEvent['moved'] = null;
    // Off a steep climb short enough to wait for: to a few minutes before
    // it, or to its top. On a long climb the feed stays — going an hour
    // without eating costs more than chewing uphill.
    if (seg.kind === 'climb' && seg.grade_pct >= FEED_MAX_GRADE_PCT && seg.duration_s <= FEED_SHORT_CLIMB_S) {
      if (seg.start_s - FEED_BEFORE_CLIMB_S - previous >= FEED_MIN_GAP_S) {
        at = seg.start_s - FEED_BEFORE_CLIMB_S;
        moved = 'before_climb';
      } else {
        at = seg.start_s + seg.duration_s;
        moved = 'after_climb';
      }
    }
    // A feed pushed to the top of a climb that ends near the finish is not worth taking.
    if (at > total - FEED_END_MARGIN_S) continue;
    fueling.push({
      at_s: Math.round(at),
      at_m: metresAt(at),
      carbs_g: Math.round(carbsPerHour / 3),
      fluid_ml: Math.round(fluidPerHour / 3 / 10) * 10,
      moved,
    });
  }

  // Blocks: a segment, cut where a feed falls inside it so the head unit
  // starts a new step — and shows its note — at the moment to eat. A feed
  // within FEED_SNAP_M of a segment's edge is said at that edge instead of
  // cutting off a sliver.
  const text = TEXT[options.lang === 'ru' ? 'ru' : 'en'];
  const km = (m: number): string => (m / 1000).toFixed(1);
  const feedAt = new Map<number, FuelingEvent>();
  for (const feed of fueling) {
    const seg = segmentAt(feed.at_s);
    const end = seg.start_m + seg.distance_m;
    feedAt.set(feed.at_m - seg.start_m < FEED_SNAP_M ? seg.start_m : end - feed.at_m < FEED_SNAP_M ? end : feed.at_m, feed);
  }
  const steps: WorkoutStep[] = [];
  for (const seg of segments) {
    const end = seg.start_m + seg.distance_m;
    const cuts = [...feedAt.keys()].filter((m) => m > seg.start_m && m < end).sort((x, y) => x - y);
    const marks = [seg.start_m, ...cuts, end];
    for (let i = 0; i + 1 < marks.length; i += 1) {
      const distance = marks[i + 1] - marks[i];
      const feed = feedAt.get(marks[i]);
      // The segment is named on its first block; a block cut out of it for a
      // feed says the feed and repeats the watts.
      const head =
        i > 0
          ? null
          : seg.kind === 'climb'
          ? text.climb(km(seg.distance_m), seg.grade_pct.toFixed(1))
          : seg.kind === 'flat'
          ? text.flat(km(seg.distance_m))
          : text.descent(km(seg.distance_m));
      const parts = [
        feed ? text.eat(feed.carbs_g) : null,
        head,
        seg.kind === 'descent' ? null : text.hold(seg.low_w, seg.high_w),
        seg.eased && i === 0 ? text.eased : null,
      ];
      steps.push({
        kind: STEP_KIND[seg.kind],
        duration_s: Math.max(5, Math.round((seg.duration_s * distance) / seg.distance_m)),
        distance_m: Math.round(distance),
        zone: zoneOf(seg.pct_ftp / 100),
        target: seg.kind === 'descent' ? null : { unit: 'w', low: seg.low_w, high: seg.high_w },
        cadence: null,
        cue: parts.filter(Boolean).join('. '),
        rep: null,
        reps: null,
      });
    }
  }

  return {
    summary: {
      distance_m: course.distance_m,
      gain_m: course.gain_m,
      duration_s: Math.round(total),
      avg_speed_kmh: Math.round((course.distance_m / total) * 36) / 10,
      np_w: Math.round(np),
      if_: Math.round(intensity * 100) / 100,
      tss: Math.round(totalHours * intensity * intensity * 100),
      carbs_g_per_h: carbsPerHour,
      fluid_ml_per_h: fluidPerHour,
      carbs_g: fueling.reduce((s, f) => s + f.carbs_g, 0),
      fluid_ml: fueling.reduce((s, f) => s + f.fluid_ml, 0),
      drafting,
      effort,
      target_s: targetS === null ? null : Math.round(targetS),
      target_reachable: targetReachable,
      over_race_level: Math.round((intensity - raceIntensity(totalHours, 'race')) * 100) / 100,
      splits: splitResults,
    },
    segments,
    fueling,
    steps,
  };
}
