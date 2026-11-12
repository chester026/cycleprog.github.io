/**
 * Per-ride breakdown from a ride's per-second streams — the few hundred
 * bytes the coach gets instead of the raw arrays (docs/plans/
 * coach-ride-power-breakdown.md §2): NP/IF/TSS/VI, time in Coggan zones,
 * this ride's best efforts, a climb/flat/descent segment table with watts,
 * HR, speed and cadence per segment, first-vs-second-half pacing and the
 * share of coasting.
 *
 * Power figures are real only for power-meter rides (`watts` stream present).
 * Without one the result still carries the segment table — speed, HR and
 * grade per climb are useful on their own — with `source: 'none'` and every
 * watts field null, so the caller never confuses an estimate with a reading.
 */
import { bestEfforts, powerZones, powerZoneDistribution, toOneHertz } from './powerProfile.js';
import { effortsOnly, rideIntervals, type IntervalTarget, type RideIntervals } from './rideIntervals.js';

export interface RidePowerStreams {
  watts?: { data?: ReadonlyArray<number | null> } | null;
  heartrate?: { data?: ReadonlyArray<number | null> } | null;
  cadence?: { data?: ReadonlyArray<number | null> } | null;
  altitude?: { data?: ReadonlyArray<number | null> } | null;
  velocity_smooth?: { data?: ReadonlyArray<number | null> } | null;
  time?: { data?: ReadonlyArray<number> } | null;
}

export type RideSegmentKind = 'climb' | 'flat' | 'descent';

export interface RideSegment {
  kind: RideSegmentKind;
  /** Seconds from the start of the ride. */
  start_s: number;
  duration_s: number;
  distance_m: number;
  /** Net grade over the segment, percent (positive = uphill). */
  grade_pct: number;
  avg_w: number | null;
  avg_hr: number | null;
  avg_speed_kmh: number;
  avg_cadence: number | null;
  /**
   * The segment's altitude profile, PROFILE_POINTS samples evenly spaced by
   * distance (metres, one decimal) — enough to draw the climb's shape on a
   * card, small enough to cache with the breakdown.
   */
  profile: number[];
}

/** Samples in a segment's altitude profile. */
export const PROFILE_POINTS = 24;

/**
 * `points` altitude samples between sample indexes `from` and `to`, evenly
 * spaced by distance (by index when the segment covers no distance). A
 * missing altitude reading takes the last known one.
 */
export function segmentProfile(
  alt: ReadonlyArray<number | null>,
  dist: ReadonlyArray<number>,
  from: number,
  to: number,
  points = PROFILE_POINTS,
): number[] {
  const out: number[] = [];
  const d0 = dist[from];
  const span = dist[to] - d0;
  let i = from;
  let last = num(alt[from]) ?? 0;
  for (let k = 0; k < points; k += 1) {
    const f = points === 1 ? 0 : k / (points - 1);
    if (span > 0) {
      const target = d0 + span * f;
      while (i < to && dist[i + 1] <= target) i += 1;
    } else {
      i = from + Math.round((to - from) * f);
    }
    const a = num(alt[i]);
    if (a !== null) last = a;
    out.push(round1(last));
  }
  return out;
}

export interface RidePowerBreakdown {
  source: 'meter' | 'none';
  /** Elapsed seconds, first to last sample. */
  duration_s: number;
  /** Seconds the whole-ride numbers are averaged over: elapsed minus stops longer than MAX_GAP_S. */
  moving_s: number;
  avg_w: number | null;
  np_w: number | null;
  max_w: number | null;
  /** Variability index, NP / avg. */
  vi: number | null;
  /** Intensity factor, NP / FTP; null without an FTP. */
  if_: number | null;
  tss: number | null;
  /** Best efforts of THIS ride, keyed by seconds (5, 60, 300, 1200, 3600); durations the ride is too short for are omitted. */
  best_efforts_w: Record<number, number>;
  /** Seconds in Coggan zones Z1..Z7; empty without an FTP. */
  zones_s: number[];
  segments: RideSegment[];
  /**
   * Average watts of the first vs second half; `pct` is the change (negative
   * = faded). Null on a ride with a repeated set of efforts: its second half
   * holds the cool-down, so the halves say nothing — `intervals.set.fade_pct`
   * (last effort vs first) is the pacing figure there.
   */
  fade: { first_half_w: number; second_half_w: number; pct: number } | null;
  /** Share (percent) of moving samples at 0 W. */
  coasting_pct: number | null;
  /** The ride's work blocks and the set they form (rideIntervals); null on a ride ridden at one level. */
  intervals: RideIntervals | null;
}

/** Window the normalized-power rolling mean uses, seconds (Coggan). */
const NP_WINDOW_S = 30;
/** Grade is measured over this much distance so GPS altitude noise averages out. */
const GRADE_WINDOW_M = 200;
/** A run of same-kind samples shorter than this is folded into its neighbour. */
const MIN_SEGMENT_M = 500;
/** Only the longest this-many runs are listed so the table stays readable. */
const MAX_SEGMENTS = 12;
/** Grade thresholds, as a fraction. */
const CLIMB_GRADE = 0.03;
/** Samples slower than this are standing still, excluded from the coasting share. */
const MOVING_MS = 1;
/** Sample gaps longer than this are auto-pause and carry no time weight. */
const MAX_GAP_S = 5;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Normalized power over a 1 Hz series: 30 s rolling mean → ^4 → mean → ^¼. */
export function normalizedPower(watts1hz: ReadonlyArray<number>): number | null {
  const n = watts1hz.length;
  if (n === 0) return null;
  const window = Math.min(NP_WINDOW_S, n);
  let sum = 0;
  let acc = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    sum += watts1hz[i];
    if (i >= window) sum -= watts1hz[i - window];
    if (i >= window - 1) {
      acc += (sum / window) ** 4;
      count += 1;
    }
  }
  return Math.round((acc / count) ** 0.25);
}

/**
 * 1 Hz series on MOVING time: like `toOneHertz`, short gaps (≤ MAX_GAP_S)
 * hold the previous reading, but a longer gap — an auto-pause, a stop — is
 * cut out instead of zero-filled, so the two sides of the stop sit next to
 * each other.
 */
export function toMovingOneHertz(time: ReadonlyArray<number>, watts: ReadonlyArray<number>): number[] {
  const n = Math.min(time.length, watts.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const gap = i + 1 < n ? time[i + 1] - time[i] : 1;
    const hold = gap <= 0 ? 0 : gap <= MAX_GAP_S ? Math.round(gap) : 1;
    const value = Number.isFinite(watts[i]) && watts[i] > 0 ? watts[i] : 0;
    for (let k = 0; k < hold; k += 1) out.push(value);
  }
  return out;
}

interface Run {
  kind: RideSegmentKind;
  from: number; // sample index, inclusive
  to: number; // sample index, inclusive
}

function classify(grade: number): RideSegmentKind {
  if (grade >= CLIMB_GRADE) return 'climb';
  if (grade <= -CLIMB_GRADE) return 'descent';
  return 'flat';
}

/**
 * Splits the ride into climb / flat / descent runs from altitude and
 * cumulative distance. Returns [] when either stream is missing.
 */
function buildRuns(alt: ReadonlyArray<number | null>, dist: number[]): Run[] {
  const n = dist.length;
  const kinds: RideSegmentKind[] = new Array(n);
  // Grade at sample i is measured over a window centred on i (half of
  // GRADE_WINDOW_M behind, half ahead) so a run's boundaries land where the
  // road actually changes rather than half a window early.
  const half = GRADE_WINDOW_M / 2;
  let behind = 0;
  let ahead = 0;
  for (let i = 0; i < n; i += 1) {
    while (behind < i && dist[i] - dist[behind] > half) behind += 1;
    while (ahead + 1 < n && dist[ahead] - dist[i] < half) ahead += 1;
    const dd = dist[ahead] - dist[behind];
    const a0 = num(alt[behind]);
    const a1 = num(alt[ahead]);
    kinds[i] = dd > 0 && a0 !== null && a1 !== null ? classify((a1 - a0) / dd) : i > 0 ? kinds[i - 1] : 'flat';
  }
  const runs: Run[] = [];
  for (let i = 0; i < n; i += 1) {
    const last = runs[runs.length - 1];
    if (last && last.kind === kinds[i]) last.to = i;
    else runs.push({ kind: kinds[i], from: i, to: i });
  }
  // Fold runs shorter than MIN_SEGMENT_M into the previous run (or the next
  // one, for a short opening run), then cap the count by merging the
  // shortest run into its shorter neighbour.
  const length = (r: Run): number => dist[r.to] - dist[r.from];
  const mergeInto = (list: Run[], idx: number, into: number): void => {
    const a = list[Math.min(idx, into)];
    const b = list[Math.max(idx, into)];
    a.to = b.to;
    a.kind = list[into].kind;
    list.splice(Math.max(idx, into), 1);
  };
  for (let i = 0; i < runs.length && runs.length > 1; ) {
    if (length(runs[i]) >= MIN_SEGMENT_M) {
      i += 1;
      continue;
    }
    mergeInto(runs, i, i > 0 ? i - 1 : i + 1);
    if (i > 0) i -= 1;
  }
  // Folding can leave two same-kind runs side by side (a bump folded into
  // the flat before it, followed by the flat after it) — join them.
  const coalesce = (list: Run[]): void => {
    for (let i = 1; i < list.length; ) {
      if (list[i].kind === list[i - 1].kind) {
        list[i - 1].to = list[i].to;
        list.splice(i, 1);
      } else i += 1;
    }
  };
  coalesce(runs);
  // More than MAX_SEGMENTS runs (a ride of thirty equal hills): keep the
  // longest ones, in ride order. Merging would only glue unrelated hills
  // into one meaningless row; the coach is after the big climbs anyway.
  if (runs.length > MAX_SEGMENTS) {
    const keep = runs
      .map((r, i) => ({ i, len: length(r) }))
      .sort((a, b) => b.len - a.len)
      .slice(0, MAX_SEGMENTS)
      .map((x) => x.i)
      .sort((a, b) => a - b);
    return keep.map((i) => runs[i]);
  }
  return runs;
}

function timeWeightedMean(values: ReadonlyArray<number | null | undefined>, dt: number[], from: number, to: number): number | null {
  let sum = 0;
  let weight = 0;
  for (let i = from; i <= to; i += 1) {
    const v = num(values[i]);
    if (v === null || v <= 0) continue;
    sum += v * dt[i];
    weight += dt[i];
  }
  return weight > 0 ? sum / weight : null;
}

/**
 * The breakdown. `ftp` enables IF/TSS/zones; pass null when unknown.
 * `target` is the watts range the ride was meant to hold (the planned
 * session's, or the one in the ride's name) — the work blocks are read
 * against it.
 */
export function ridePowerBreakdown(
  streams: RidePowerStreams | null | undefined,
  opts: { ftp?: number | null; target?: IntervalTarget | null } = {},
): RidePowerBreakdown {
  const ftp = opts.ftp && opts.ftp > 0 ? opts.ftp : null;
  const rawWatts = streams?.watts?.data ?? null;
  const hasMeter = Array.isArray(rawWatts) && rawWatts.some((w) => num(w) !== null && (w as number) > 0);
  const n = Math.max(
    rawWatts?.length ?? 0,
    streams?.heartrate?.data?.length ?? 0,
    streams?.altitude?.data?.length ?? 0,
    streams?.velocity_smooth?.data?.length ?? 0,
    streams?.time?.data?.length ?? 0,
  );
  const time: number[] = new Array(n);
  const rawTime = streams?.time?.data;
  for (let i = 0; i < n; i += 1) time[i] = num(rawTime?.[i]) ?? (i > 0 ? time[i - 1] + 1 : 0);
  // Time weight of sample i = gap to the next sample, capped so an
  // auto-pause does not count as an hour of 0 W; the last sample is 1 s.
  const dt: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const gap = i + 1 < n ? time[i + 1] - time[i] : 1;
    dt[i] = gap <= 0 ? 0 : gap <= MAX_GAP_S ? gap : 1;
  }
  const duration_s = n > 0 ? Math.round(time[n - 1] - time[0]) : 0;

  const empty: RidePowerBreakdown = {
    source: hasMeter ? 'meter' : 'none',
    duration_s,
    moving_s: Math.round(dt.reduce((a, b) => a + b, 0)),
    avg_w: null,
    np_w: null,
    max_w: null,
    vi: null,
    if_: null,
    tss: null,
    best_efforts_w: {},
    zones_s: [],
    segments: [],
    fade: null,
    coasting_pct: null,
    intervals: null,
  };
  if (n === 0) return empty;

  const velocity = streams?.velocity_smooth?.data ?? null;
  const altitude = streams?.altitude?.data ?? null;
  const heartrate = streams?.heartrate?.data ?? null;
  const cadence = streams?.cadence?.data ?? null;

  // Cumulative distance from speed × dt (the streams request carries no
  // distance stream); null speed holds position.
  const dist: number[] = new Array(n);
  let d = 0;
  for (let i = 0; i < n; i += 1) {
    dist[i] = d;
    const v = num(velocity?.[i]);
    if (v !== null && v > 0) d += v * dt[i];
  }

  const segments: RideSegment[] = velocity && altitude
    ? buildRuns(altitude, dist).map((r) => {
        const distance_m = dist[r.to] - dist[r.from];
        let seg_s = 0;
        for (let i = r.from; i <= r.to; i += 1) seg_s += dt[i];
        const a0 = num(altitude[r.from]);
        const a1 = num(altitude[r.to]);
        const avgW = hasMeter ? timeWeightedMean(rawWatts, dt, r.from, r.to) : null;
        const hr = timeWeightedMean(heartrate ?? [], dt, r.from, r.to);
        const cad = timeWeightedMean(cadence ?? [], dt, r.from, r.to);
        return {
          kind: r.kind,
          start_s: Math.round(time[r.from] - time[0]),
          duration_s: Math.round(seg_s),
          distance_m: Math.round(distance_m),
          grade_pct: distance_m > 0 && a0 !== null && a1 !== null ? round1(((a1 - a0) / distance_m) * 100) : 0,
          avg_w: avgW === null ? null : Math.round(avgW),
          avg_hr: hr === null ? null : Math.round(hr),
          avg_speed_kmh: round1((distance_m / Math.max(seg_s, 1)) * 3.6),
          avg_cadence: cad === null ? null : Math.round(cad),
          profile: segmentProfile(altitude, dist, r.from, r.to),
        };
      })
    : [];

  if (!hasMeter) return { ...empty, segments };

  const wattsClean = (rawWatts as ReadonlyArray<number | null>).map((w) => num(w) ?? 0);
  // Two 1 Hz views of the same ride. `watts1hz` keeps a stop as zeros
  // (toOneHertz) — right for best efforts, where a 20-minute "effort" must
  // not bridge a café stop. Everything that describes the ride as a whole
  // (average, NP, IF, TSS, zones, halves) is on MOVING time, as every
  // training platform reports it: stops are cut out, not counted as 0 W.
  const watts1hz = toOneHertz(time, wattsClean);
  const movingWatts = toMovingOneHertz(time, wattsClean);
  const total = movingWatts.reduce((s, w) => s + w, 0);
  // Neither series is empty for n > 0, and hasMeter guarantees a positive
  // sample, so avg > 0 here.
  const avg = total / movingWatts.length;
  const np = normalizedPower(movingWatts) as number;
  const max = Math.max(0, ...wattsClean);
  const half = Math.floor(movingWatts.length / 2);
  const mean = (arr: number[]): number => (arr.length ? arr.reduce((s, w) => s + w, 0) / arr.length : 0);
  const first = mean(movingWatts.slice(0, half));
  const second = mean(movingWatts.slice(half));

  let moving = 0;
  let coasting = 0;
  for (let i = 0; i < n; i += 1) {
    const v = num(velocity?.[i]);
    if (v === null || v < MOVING_MS) continue;
    moving += 1;
    if (wattsClean[i] === 0) coasting += 1;
  }

  const zones = ftp ? powerZoneDistribution(movingWatts, powerZones(ftp)) : [];
  const intervals = rideIntervals(streams, { ftp, target: opts.target });
  const halves =
    half > 0 && !intervals?.set
      ? { first_half_w: Math.round(first), second_half_w: Math.round(second), pct: first > 0 ? round1(((second - first) / first) * 100) : 0 }
      : null;
  const if_ = ftp ? np / ftp : null;

  return {
    source: 'meter',
    duration_s,
    moving_s: movingWatts.length,
    avg_w: Math.round(avg),
    np_w: np,
    max_w: Math.round(max),
    vi: Math.round((np / avg) * 100) / 100,
    if_: if_ === null ? null : Math.round(if_ * 100) / 100,
    tss: if_ === null ? null : Math.round(((movingWatts.length * np * if_) / ((ftp as number) * 3600)) * 100),
    best_efforts_w: bestEfforts(watts1hz),
    zones_s: zones.map((z) => z.samples),
    segments,
    fade: halves,
    coasting_pct: moving > 0 ? Math.round((coasting / moving) * 100) : null,
    // An easy ride's "blocks" are not efforts (effortsOnly); the halves
    // above still go by what the power showed, so a breakdown rebuilt later
    // for another FTP (Garmin rides) agrees with this one.
    intervals: effortsOnly(intervals, ftp),
  };
}
