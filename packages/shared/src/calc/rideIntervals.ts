/**
 * Work blocks of a ride, from its per-second power: where the rider held an
 * effort, for how long, at what watts / heart rate / cadence, how steady it
 * was, what the rests between were — and, when the efforts repeat, the set
 * they form ("3 × 8:00 @ 181 W, last vs first −2 %").
 *
 * This is what makes an interval session readable. The whole-ride numbers
 * (average, NP, VI, first-vs-second-half fade) describe a structured ride
 * badly: the average sits between work and rest, VI is high by design and
 * the second half holds the cool-down. The blocks are the session.
 *
 * With a target (the planned workout's watts range, or the one in the ride's
 * name) each block also says how much of it was ridden inside the range.
 */
import type { RidePowerStreams } from './ridePower.js';

export interface IntervalTarget {
  low: number;
  high: number;
  /** Where the range came from: the calendar session's blocks, or the ride's name. */
  source: 'plan' | 'name';
  /** What the plan asked for: repetitions and the length of one effort. */
  planned?: { reps: number; duration_s: number } | null;
}

export interface RideInterval {
  /** 1-based, in ride order. */
  index: number;
  /** Seconds from the start of the ride. */
  start_s: number;
  duration_s: number;
  avg_w: number;
  max_w: number;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
  /** Steadiness: standard deviation of 30 s power as a share of the average, percent. Lower is steadier. */
  cv_pct: number;
  /** Average as a share of FTP, percent; null without an FTP. */
  pct_ftp: number | null;
  /** Share of the block ridden inside the target range (30 s power), percent; null without a target. */
  in_target_pct: number | null;
  /** The block's average against the target range; null without a target. */
  vs_target: 'below' | 'in' | 'above' | null;
  /** The rest before the next block: its length and average watts; null after the last block. */
  rest_after_s: number | null;
  rest_after_w: number | null;
}

export interface IntervalSet {
  /** How many blocks repeat the same effort. */
  reps: number;
  /** Indexes (1-based) of those blocks. */
  blocks: number[];
  /** Typical length of one effort and of the rest between two, seconds. */
  duration_s: number;
  rest_s: number;
  /** Average watts across the set's work time. */
  avg_w: number;
  first_w: number;
  last_w: number;
  /** Last effort against the first, percent (negative = faded). */
  fade_pct: number;
  /** Strongest effort against the weakest, percent of the set's average. */
  spread_pct: number;
  /** How many efforts averaged inside the target range; null without a target. */
  hits: number | null;
}

export interface RideIntervals {
  /** Watts above which the ride counts as work. */
  threshold_w: number;
  target: IntervalTarget | null;
  blocks: RideInterval[];
  set: IntervalSet | null;
  /** All work time and its average watts. */
  work_s: number;
  work_avg_w: number;
}

/** Centred window the work/rest split is read from, seconds. */
const SMOOTH_S = 15;
/** Window steadiness and time-in-target are measured on, seconds. */
const STEADY_S = 30;
/** A dip shorter than this inside an effort does not end it. */
const BRIDGE_S = 20;
/** Anything shorter is a surge, not a block. */
const MIN_BLOCK_S = 30;
/** Only the longest this-many blocks are listed. */
const MAX_BLOCKS = 20;
/** Histogram bin for the work/rest split, watts. */
const BIN_W = 5;
/** Work must sit this far above rest (watts, and share of the work level) for the ride to have blocks at all. */
const MIN_SEPARATION_W = 30;
const MIN_SEPARATION_SHARE = 0.25;
/** With a target, work starts this far under its lower bound. */
const TARGET_THRESHOLD_SHARE = 0.9;
/** Two blocks repeat the same effort when their length and watts are this close. */
const SET_DURATION_TOLERANCE = 0.25;
const SET_WATTS_TOLERANCE = 0.15;
/** Efforts this long form a set only when the rests between them are at most MAX_REST_SHARE of their length. */
const LONG_EFFORT_S = 180;
const MAX_REST_SHARE = 2;
/** Sample gaps longer than this are a stop. */
const MAX_GAP_S = 5;
/** Longest ride read, seconds (24 h). */
const MAX_SECONDS = 86400;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A watts range out of free text — a ride's name, a session's title:
 * "Intervals 170-190W", "3x8 @ 250 Вт". A single figure becomes ±5 %. Null
 * when the text names no watts.
 */
export function parseWattsTarget(text: string | null | undefined): { low: number; high: number } | null {
  if (!text) return null;
  const sane = (w: number): boolean => w >= 50 && w <= 1500;
  const range = /(\d{2,4})\s*[-–—]\s*(\d{2,4})\s*(?:watts?|w|вт)(?![a-zа-яё])/i.exec(text);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return sane(low) && sane(high) && low < high ? { low, high } : null;
  }
  const single = /(\d{2,4})\s*(?:watts?|w|вт)(?![a-zа-яё])/i.exec(text);
  if (single) {
    const w = Number(single[1]);
    return sane(w) ? { low: Math.round(w * 0.95), high: Math.round(w * 1.05) } : null;
  }
  return null;
}

/**
 * The shape of a set out of free text: "3x8′", "4×5 min", "10x30s",
 * "3х8 мин" → repetitions and the length of one effort. A bare "3x8" is
 * minutes. Null when the text names no set.
 */
export function parseSetShape(text: string | null | undefined): { reps: number; duration_s: number } | null {
  if (!text) return null;
  const m = /(\d{1,2})\s*[x×х*]\s*(\d{1,3})\s*(′|'|’|min|мин|m(?![a-z])|″|"|sec|сек|s(?![a-z])|с(?![а-яё]))?/i.exec(text);
  if (!m) return null;
  const reps = Number(m[1]);
  const unit = (m[3] ?? '').toLowerCase();
  const seconds = ['″', '"', 'sec', 'сек', 's', 'с'].includes(unit);
  const duration_s = Number(m[2]) * (seconds ? 1 : 60);
  return reps >= 2 && reps <= 30 && duration_s >= 10 && duration_s <= 3600 ? { reps, duration_s } : null;
}

interface PlannedStep {
  kind: string;
  duration_s: number;
  target?: { unit: string; low: number; high: number } | null;
}

/**
 * The watts range a planned session asks for in its efforts: the target the
 * most work time is planned at, with how many efforts carry it and how long
 * one is. Null when no effort has a watts target.
 */
export function workoutWattsTarget(workout: { steps?: ReadonlyArray<PlannedStep> } | null | undefined): IntervalTarget | null {
  const steps = (workout?.steps ?? []).filter((s) => s.target && s.target.unit === 'w');
  const work = steps.filter((s) => s.kind === 'work');
  const pool = work.length ? work : steps.filter((s) => s.kind === 'steady');
  const groups = new Map<string, { low: number; high: number; total: number; durations: number[] }>();
  for (const s of pool) {
    const t = s.target as { low: number; high: number };
    const key = `${t.low}-${t.high}`;
    const g = groups.get(key) ?? { low: t.low, high: t.high, total: 0, durations: [] };
    g.total += s.duration_s;
    g.durations.push(s.duration_s);
    groups.set(key, g);
  }
  let best: { low: number; high: number; total: number; durations: number[] } | null = null;
  for (const g of groups.values()) if (!best || g.total > best.total) best = g;
  if (!best) return null;
  return { low: best.low, high: best.high, source: 'plan', planned: { reps: best.durations.length, duration_s: Math.round(median(best.durations)) } };
}

/** Rolling mean over `window` samples; centred, or trailing when `centred` is false. */
function rollingMean(values: ReadonlyArray<number>, window: number, centred: boolean): number[] {
  const n = values.length;
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i] + values[i];
  const before = centred ? Math.floor(window / 2) : window - 1;
  const after = centred ? window - 1 - before : 0;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const from = Math.max(0, i - before);
    const to = Math.min(n - 1, i + after);
    out[i] = (prefix[to + 1] - prefix[from]) / (to - from + 1);
  }
  return out;
}

/**
 * Otsu's split of a watts series into two levels: the threshold that
 * separates them best and the mean of each side. Null when the series has a
 * single level.
 */
function splitLevels(values: ReadonlyArray<number>): { threshold: number; low: number; high: number; highShare: number } | null {
  const bins: number[] = [];
  for (const v of values) {
    const b = Math.floor(v / BIN_W);
    bins[b] = (bins[b] ?? 0) + 1;
  }
  const total = values.length;
  let sumAll = 0;
  for (let b = 0; b < bins.length; b += 1) sumAll += b * (bins[b] ?? 0);
  let best: { threshold: number; low: number; high: number; highShare: number } | null = null;
  let bestVar = 0;
  let count = 0;
  let sum = 0;
  for (let b = 0; b < bins.length - 1; b += 1) {
    count += bins[b] ?? 0;
    sum += b * (bins[b] ?? 0);
    if (count === 0) continue;
    const lowMean = sum / count;
    const highMean = (sumAll - sum) / (total - count);
    const between = count * (total - count) * (highMean - lowMean) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = { threshold: (b + 1) * BIN_W, low: (lowMean + 0.5) * BIN_W, high: (highMean + 0.5) * BIN_W, highShare: (total - count) / total };
    }
  }
  return best;
}

const separated = (s: { low: number; high: number }, share: number): boolean =>
  s.high - s.low >= Math.max(MIN_SEPARATION_W, s.high * share);

/**
 * The watts above which this ride is work. A ride ridden at one level has
 * none (null). When the work itself has two clear levels — a long tempo
 * warm-up running into harder efforts — the upper one is the work.
 */
function workThreshold(smooth: ReadonlyArray<number>): number | null {
  const first = splitLevels(smooth);
  if (!first || !separated(first, MIN_SEPARATION_SHARE)) return null;
  const upper = smooth.filter((w) => w >= first.threshold);
  const second = splitLevels(upper);
  if (second && separated(second, MIN_SEPARATION_SHARE) && second.highShare >= 0.2 && second.highShare <= 0.8) return second.threshold;
  return first.threshold;
}

interface Span {
  from: number; // second, inclusive
  to: number; // second, inclusive
}

/**
 * Runs of work: short dips bridged, edges trimmed to the raw power, short
 * runs dropped. An effort starts when the power reaches `threshold` and
 * lasts until it falls clearly back towards the rest level — halfway
 * between the threshold and the average of everything under it. Without
 * that second level an effort ridden just above the threshold (a first
 * interval at 145 W against 150–170) breaks into pieces every time the
 * power sags under the line for half a minute.
 */
function workSpans(smooth: ReadonlyArray<number>, raw: ReadonlyArray<number>, threshold: number): Span[] {
  let under = 0;
  let underCount = 0;
  for (const v of smooth) {
    if (v < threshold) {
      under += v;
      underCount += 1;
    }
  }
  const exit = underCount ? (threshold + under / underCount) / 2 : threshold;
  const spans: Span[] = [];
  let open = false;
  for (let s = 0; s < smooth.length; s += 1) {
    if (smooth[s] < threshold) {
      if (smooth[s] < exit) open = false;
      continue;
    }
    const last = spans[spans.length - 1];
    if (last && (open || s - last.to - 1 <= BRIDGE_S)) last.to = s;
    else spans.push({ from: s, to: s });
    open = true;
  }
  // The smoothed series crosses the threshold a few seconds off the real
  // edge of an effort; the raw power says where it started and ended.
  spans.forEach((span, k) => {
    const floor = k > 0 ? spans[k - 1].to + 1 : 0;
    const ceiling = k + 1 < spans.length ? spans[k + 1].from - 1 : raw.length - 1;
    while (span.from > floor && raw[span.from - 1] >= threshold) span.from -= 1;
    while (span.to < ceiling && raw[span.to + 1] >= threshold) span.to += 1;
    while (span.from < span.to && raw[span.from] < threshold) span.from += 1;
    while (span.to > span.from && raw[span.to] < threshold) span.to -= 1;
  });
  const kept = spans.filter((s) => s.to - s.from + 1 >= MIN_BLOCK_S);
  if (kept.length <= MAX_BLOCKS) return kept;
  return [...kept]
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, MAX_BLOCKS)
    .sort((a, b) => a.from - b.from);
}

/** The largest group of blocks that repeat one effort (by work time); null when no two blocks match. */
function findSet(blocks: RideInterval[], target: IntervalTarget | null): IntervalSet | null {
  let members: RideInterval[] = [];
  let bestWork = 0;
  for (const seed of blocks) {
    const group = blocks.filter(
      (b) =>
        Math.abs(b.duration_s - seed.duration_s) <= seed.duration_s * SET_DURATION_TOLERANCE &&
        Math.abs(b.avg_w - seed.avg_w) <= seed.avg_w * SET_WATTS_TOLERANCE,
    );
    const work = group.reduce((s, b) => s + b.duration_s, 0);
    if (group.length >= 2 && work > bestWork) {
      members = group;
      bestWork = work;
    }
  }
  if (members.length === 0) return null;
  const avg = members.reduce((s, b) => s + b.avg_w * b.duration_s, 0) / bestWork;
  const watts = members.map((b) => b.avg_w);
  const rests: number[] = [];
  for (let i = 0; i + 1 < members.length; i += 1) {
    rests.push(members[i + 1].start_s - members[i].start_s - members[i].duration_s);
  }
  const duration = median(members.map((b) => b.duration_s));
  const rest = median(rests);
  // Two climbs half an hour apart are similar efforts, not a set: nobody
  // rests for more than twice the length of a long interval. Only a ride
  // that names a target is taken at its word; short efforts are left alone
  // (sprint sets do rest many times their length).
  if (!target && duration >= LONG_EFFORT_S && rest > duration * MAX_REST_SHARE) return null;
  const first = members[0].avg_w;
  const last = members[members.length - 1].avg_w;
  return {
    reps: members.length,
    blocks: members.map((b) => b.index),
    duration_s: Math.round(duration),
    rest_s: Math.round(rest),
    avg_w: Math.round(avg),
    first_w: first,
    last_w: last,
    fade_pct: round1(((last - first) / first) * 100),
    spread_pct: round1(((Math.max(...watts) - Math.min(...watts)) / avg) * 100),
    hits: target ? members.filter((b) => b.vs_target === 'in').length : null,
  };
}

/**
 * The ride's work blocks. Null without a power meter, or when the ride was
 * ridden at one level and has no blocks to speak of.
 */
export function rideIntervals(
  streams: RidePowerStreams | null | undefined,
  opts: { ftp?: number | null; target?: IntervalTarget | null } = {},
): RideIntervals | null {
  const rawWatts = streams?.watts?.data;
  if (!rawWatts || !rawWatts.some((w) => (num(w) ?? 0) > 0)) return null;
  const n = rawWatts.length;
  const rawTime = streams?.time?.data;
  const time: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) time[i] = num(rawTime?.[i]) ?? (i > 0 ? time[i - 1] + 1 : 0);

  // One slot per elapsed second, pointing at the sample that covers it;
  // -1 inside a stop, where the power is 0 and there is no HR or cadence.
  const seconds = Math.min(Math.floor(time[n - 1] - time[0]) + 1, MAX_SECONDS);
  const source = new Array<number>(seconds).fill(-1);
  for (let i = 0; i < n; i += 1) {
    const start = Math.round(time[i] - time[0]);
    const gap = i + 1 < n ? time[i + 1] - time[i] : 1;
    const hold = gap <= MAX_GAP_S ? Math.max(1, Math.round(gap)) : 1;
    for (let s = start; s < start + hold && s < seconds; s += 1) source[s] = i;
  }
  const watts = source.map((i) => (i < 0 ? 0 : Math.max(0, num(rawWatts[i]) ?? 0)));
  const smooth = rollingMean(watts, SMOOTH_S, true);
  const steady = rollingMean(watts, STEADY_S, false);

  const target = opts.target ?? null;
  let threshold = target ? Math.round(target.low * TARGET_THRESHOLD_SHARE) : workThreshold(smooth);
  let spans = threshold === null ? [] : workSpans(smooth, watts, threshold);
  if (target && spans.length === 0) {
    // The rider never got near the planned range: read the blocks from the
    // ride itself, so the answer is "rode 3 × 8′ at 140 W against 170–190",
    // not "no intervals".
    threshold = workThreshold(smooth);
    spans = threshold === null ? [] : workSpans(smooth, watts, threshold);
  }
  if (threshold === null || spans.length === 0) return null;

  const ftp = opts.ftp && opts.ftp > 0 ? opts.ftp : null;
  const hr = streams?.heartrate?.data;
  const cad = streams?.cadence?.data;
  const meanOf = (data: ReadonlyArray<number | null> | undefined, span: Span): { avg: number | null; max: number | null } => {
    let sum = 0;
    let count = 0;
    let max = 0;
    for (let s = span.from; s <= span.to; s += 1) {
      const v = source[s] < 0 ? null : num(data?.[source[s]]);
      if (v === null || v <= 0) continue;
      sum += v;
      count += 1;
      if (v > max) max = v;
    }
    return count ? { avg: Math.round(sum / count), max: Math.round(max) } : { avg: null, max: null };
  };

  const blocks: RideInterval[] = spans.map((span, k) => {
    const len = span.to - span.from + 1;
    let sum = 0;
    let max = 0;
    for (let s = span.from; s <= span.to; s += 1) {
      sum += watts[s];
      if (watts[s] > max) max = watts[s];
    }
    const avg = sum / len;
    // 30 s power inside the block only: the first STEADY_S − 1 seconds
    // would still be averaging the rest before it.
    let sq = 0;
    let inRange = 0;
    let counted = 0;
    for (let s = span.from + STEADY_S - 1; s <= span.to; s += 1) {
      sq += (steady[s] - avg) ** 2;
      counted += 1;
      if (target && steady[s] >= target.low && steady[s] <= target.high) inRange += 1;
    }
    const avgW = Math.round(avg);
    const next = spans[k + 1];
    let restW: number | null = null;
    if (next) {
      let r = 0;
      for (let s = span.to + 1; s < next.from; s += 1) r += watts[s];
      restW = Math.round(r / Math.max(1, next.from - span.to - 1));
    }
    const heart = meanOf(hr, span);
    return {
      index: k + 1,
      start_s: span.from,
      duration_s: len,
      avg_w: avgW,
      max_w: Math.round(max),
      avg_hr: heart.avg,
      max_hr: heart.max,
      avg_cadence: meanOf(cad, span).avg,
      cv_pct: round1((Math.sqrt(sq / counted) / avg) * 100),
      pct_ftp: ftp ? Math.round((avgW / ftp) * 100) : null,
      in_target_pct: target ? Math.round((inRange / counted) * 100) : null,
      vs_target: !target ? null : avgW < target.low ? 'below' : avgW > target.high ? 'above' : 'in',
      rest_after_s: next ? next.from - span.to - 1 : null,
      rest_after_w: restW,
    };
  });

  const work_s = blocks.reduce((s, b) => s + b.duration_s, 0);
  return {
    threshold_w: threshold,
    target,
    blocks,
    set: findSet(blocks, target),
    work_s,
    work_avg_w: Math.round(blocks.reduce((s, b) => s + b.avg_w * b.duration_s, 0) / work_s),
  };
}

/** Below this share of FTP a block is easy riding, not an effort. */
export const EFFORT_MIN_FTP_SHARE = 0.75;

/**
 * The blocks, unless the ride was simply easy: on a Zone 2 spin the "work"
 * the split finds is a slightly less easy stretch, and calling it intervals
 * (with a verdict on how they held) is noise. Without a target, blocks none
 * of which reaches EFFORT_MIN_FTP_SHARE of FTP are no blocks at all. A ride
 * that names a target is read as it asked; without an FTP nothing is judged.
 */
export function effortsOnly(intervals: RideIntervals | null, ftp: number | null | undefined): RideIntervals | null {
  if (!intervals || intervals.target || !ftp || ftp <= 0) return intervals;
  return intervals.blocks.some((b) => b.avg_w >= ftp * EFFORT_MIN_FTP_SHARE) ? intervals : null;
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Last-vs-first change within which a set counts as held evenly, percent. */
export const SET_EVEN_PCT = 3;

/**
 * The blocks as plain statements of fact, for the coach's model: what was
 * ridden, against what, and how it held up — worked out here so the model
 * quotes a reading instead of deriving one from a table.
 */
export function intervalFacts(intervals: RideIntervals): string[] {
  const { blocks, set, target } = intervals;
  const facts: string[] = [];
  const list = set ? blocks.filter((b) => set.blocks.includes(b.index)) : blocks;
  if (set) {
    facts.push(
      `Interval set: ${set.reps} × ${clock(set.duration_s)} at ${set.avg_w} W on average (${list.map((b) => b.avg_w).join(' / ')} W), rests of about ${clock(set.rest_s)}.`,
    );
    const held = Math.abs(set.fade_pct) <= SET_EVEN_PCT ? 'held evenly across the set' : set.fade_pct < 0 ? 'faded across the set' : 'built across the set';
    facts.push(`Last effort vs first: ${set.fade_pct > 0 ? '+' : ''}${set.fade_pct} % — ${held}.`);
  } else {
    const longest = blocks.reduce((a, b) => (b.duration_s > a.duration_s ? b : a));
    facts.push(
      `${blocks.length} distinct effort${blocks.length === 1 ? '' : 's'} above ${intervals.threshold_w} W, no repeated set; the longest is ${clock(longest.duration_s)} at ${longest.avg_w} W.`,
    );
  }
  if (target) {
    const inside = list.filter((b) => b.vs_target === 'in').length;
    const below = list.filter((b) => b.vs_target === 'below').length;
    const above = list.length - inside - below;
    const off = [below ? `${below} below` : '', above ? `${above} above` : ''].filter(Boolean).join(', ');
    facts.push(
      `Target ${target.low}–${target.high} W (${target.source === 'plan' ? 'from the planned session' : "from the ride's name"}): ${inside} of ${list.length} efforts averaged inside it${off ? ` (${off})` : ''}; share of each effort ridden inside the range: ${list.map((b) => b.in_target_pct).join(' / ')} %.`,
    );
    if (target.planned) {
      facts.push(`Planned ${target.planned.reps} × ${clock(target.planned.duration_s)}; ridden ${list.length} × ${clock(set ? set.duration_s : list[0].duration_s)}.`);
    }
  }
  if (list.every((b) => b.avg_hr !== null)) facts.push(`Heart rate per effort: ${list.map((b) => b.avg_hr).join(' / ')} bpm.`);
  return facts;
}
