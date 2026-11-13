/**
 * A route file → the course a race plan is made for: its length, climbing,
 * a drawing-sized altitude profile and the terrain cut into climbs, flats
 * and descents that cover it end to end (calc/racePlan.ts paces each one).
 *
 * `parseGpx` reads a GPX track or route; a FIT course or activity is read on
 * the server (the FIT SDK lives there) into the same `CoursePoint`s. Unlike
 * the ride breakdown's segment table, which lists only the longest runs, the
 * course's segments leave no gaps: every metre belongs to one, because every
 * metre has to be ridden.
 */

export interface CoursePoint {
  lat: number;
  lon: number;
  /** Altitude, metres; null when the file has none for this point. */
  ele: number | null;
  /** Distance from the start, metres, when the file carries it (FIT). */
  dist?: number | null;
}

export type CourseSegmentKind = 'climb' | 'flat' | 'descent';

export interface CourseSegment {
  kind: CourseSegmentKind;
  /** Metres from the start. */
  start_m: number;
  distance_m: number;
  /** Net grade, percent (positive = uphill). */
  grade_pct: number;
  /** Metres climbed inside the segment. */
  gain_m: number;
}

export interface Course {
  name: string | null;
  distance_m: number;
  gain_m: number;
  /** [metres from the start, altitude] pairs, COURSE_PROFILE_POINTS of them. */
  profile: Array<[number, number]>;
  segments: CourseSegment[];
}

/** Points in the stored altitude profile. */
export const COURSE_PROFILE_POINTS = 120;
/** A file with more track points than this is thinned before use. */
export const COURSE_MAX_POINTS = 50000;
/** The course is resampled to one altitude every this many metres. */
const STEP_M = 25;
/** Altitude is averaged over this many samples each side (GPS and DEM noise). */
const SMOOTH_SAMPLES = 4;
/** Grade is measured over this distance, centred on the sample. */
const GRADE_WINDOW_M = 200;
const CLIMB_GRADE = 0.03;
/** A run shorter than this is folded into the one before it. */
const MIN_SEGMENT_M = 400;
/** More segments than this cannot be paced, drawn or followed on a head unit. */
export const COURSE_MAX_SEGMENTS = 18;
/** Anything shorter is not a course. */
const MIN_COURSE_M = 1000;
const EARTH_RADIUS_M = 6371000;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Track points (`trkpt`), or route points (`rtept`) when the file has no
 * track, with the track's or the file's name. Tolerant of attribute order
 * and namespaces; points without a usable position are skipped.
 */
export function parseGpx(xml: string): { name: string | null; points: CoursePoint[] } {
  const tag = /<trkpt[\s>]/.test(xml) ? 'trkpt' : 'rtept';
  const pointRe = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g');
  const points: CoursePoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = pointRe.exec(xml)) !== null) {
    const lat = Number(/\blat\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1]);
    const lon = Number(/\blon\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleText = /<ele>\s*([^<\s]+)\s*<\/ele>/.exec(m[2] ?? '')?.[1];
    const ele = eleText === undefined ? NaN : Number(eleText);
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  // The track's own name first (`<trk><name>`), the file's metadata second.
  const named = /<trk>\s*<name>([\s\S]*?)<\/name>/.exec(xml) ?? /<rte>\s*<name>([\s\S]*?)<\/name>/.exec(xml) ?? /<name>([\s\S]*?)<\/name>/.exec(xml);
  const name = named ? decodeXml(named[1]) : '';
  return { name: name || null, points };
}

function haversine(a: CoursePoint, b: CoursePoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

interface Run {
  kind: CourseSegmentKind;
  from: number; // sample index, inclusive
  to: number; // sample index, inclusive — the next run starts here
}

function kindOf(grade: number): CourseSegmentKind {
  if (grade >= CLIMB_GRADE) return 'climb';
  if (grade <= -CLIMB_GRADE) return 'descent';
  return 'flat';
}

/** Joins neighbours of one kind. */
function coalesce(runs: Run[]): void {
  for (let i = 1; i < runs.length; ) {
    if (runs[i].kind === runs[i - 1].kind) {
      runs[i - 1].to = runs[i].to;
      runs.splice(i, 1);
    } else i += 1;
  }
}

export type BuildCourseResult = { ok: true; course: Course } | { ok: false; error: 'too_short' | 'no_elevation' };

/**
 * The course of a list of points. Refused when the points cover less than a
 * kilometre, or when fewer than half of them carry an altitude — a plan
 * without the climbs is not a plan.
 */
export function buildCourse(input: readonly CoursePoint[], name: string | null = null): BuildCourseResult {
  // Thin an oversized file evenly; the 25 m resampling below does not need more.
  const stride = Math.max(1, Math.ceil(input.length / COURSE_MAX_POINTS));
  const points = stride === 1 ? input : input.filter((_, i) => i % stride === 0 || i === input.length - 1);
  if (points.length < 2) return { ok: false, error: 'too_short' };

  // Distance along the course: the file's own when every point has one and
  // it only grows, otherwise measured between the positions.
  const own = points.every((p, i) => typeof p.dist === 'number' && Number.isFinite(p.dist) && (i === 0 || p.dist >= (points[i - 1].dist as number)));
  const dist: number[] = new Array(points.length);
  dist[0] = 0;
  for (let i = 1; i < points.length; i += 1) {
    dist[i] = own ? (points[i].dist as number) - (points[0].dist as number) : dist[i - 1] + haversine(points[i - 1], points[i]);
  }
  const total = dist[points.length - 1];
  if (total < MIN_COURSE_M) return { ok: false, error: 'too_short' };
  const withEle = points.filter((p) => p.ele !== null).length;
  if (withEle * 2 < points.length) return { ok: false, error: 'no_elevation' };

  // One altitude every STEP_M metres; a point without one takes the last known.
  const firstEle = points.find((p) => p.ele !== null)?.ele as number;
  const n = Math.floor(total / STEP_M) + 1;
  const raw: number[] = new Array(n);
  let j = 0;
  let known = firstEle;
  let knownAt = 0;
  for (let k = 0; k < n; k += 1) {
    const at = k * STEP_M;
    while (j + 1 < points.length && dist[j + 1] <= at) {
      j += 1;
      if (points[j].ele !== null) {
        known = points[j].ele as number;
        knownAt = dist[j];
      }
    }
    // Towards the next point that has an altitude, in a straight line.
    let next = j + 1;
    while (next < points.length && points[next].ele === null) next += 1;
    if (next < points.length && dist[next] > knownAt) {
      const f = Math.min(1, Math.max(0, (at - knownAt) / (dist[next] - knownAt)));
      raw[k] = known + ((points[next].ele as number) - known) * f;
    } else {
      raw[k] = known;
    }
  }
  const ele: number[] = raw.map((_, k) => {
    const from = Math.max(0, k - SMOOTH_SAMPLES);
    const to = Math.min(n - 1, k + SMOOTH_SAMPLES);
    let sum = 0;
    for (let i = from; i <= to; i += 1) sum += raw[i];
    return sum / (to - from + 1);
  });

  // Terrain: the kind of every sample from the grade around it, as runs.
  const half = Math.round(GRADE_WINDOW_M / STEP_M / 2);
  const runs: Run[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const a = Math.max(0, k - half);
    const b = Math.min(n - 1, k + half);
    const kind = kindOf((ele[b] - ele[a]) / ((b - a) * STEP_M));
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.to = k + 1;
    else runs.push({ kind, from: k, to: k + 1 });
  }
  const length = (r: Run): number => (r.to - r.from) * STEP_M;
  const grade = (r: Run): number => (ele[r.to] - ele[r.from]) / length(r);
  // Short runs join the one before them (the first joins the one after).
  for (let i = 0; i < runs.length && runs.length > 1; ) {
    if (length(runs[i]) >= MIN_SEGMENT_M) {
      i += 1;
      continue;
    }
    if (i === 0) {
      runs[1].from = runs[0].from;
      runs.splice(0, 1);
    } else {
      runs[i - 1].to = runs[i].to;
      runs.splice(i, 1);
      i -= 1;
    }
  }
  coalesce(runs);
  // Still too many: the shortest run joins the neighbour whose grade is
  // closest to its own, until the list is one a rider can follow.
  while (runs.length > COURSE_MAX_SEGMENTS) {
    let shortest = 0;
    for (let i = 1; i < runs.length; i += 1) if (length(runs[i]) < length(runs[shortest])) shortest = i;
    const g = grade(runs[shortest]);
    const before = shortest > 0 ? Math.abs(grade(runs[shortest - 1]) - g) : Infinity;
    const after = shortest + 1 < runs.length ? Math.abs(grade(runs[shortest + 1]) - g) : Infinity;
    const into = before <= after ? shortest - 1 : shortest + 1;
    const first = Math.min(shortest, into);
    runs[first].to = runs[first + 1].to;
    runs[first].kind = kindOf(grade(runs[first]));
    runs.splice(first + 1, 1);
    coalesce(runs);
  }

  const gainBetween = (from: number, to: number): number => {
    let gain = 0;
    for (let i = from + 1; i <= to; i += 1) if (ele[i] > ele[i - 1]) gain += ele[i] - ele[i - 1];
    return gain;
  };
  const segments: CourseSegment[] = runs.map((r, i) => {
    // The last segment runs to the very end of the course, not to the last whole sample.
    const end = i === runs.length - 1 ? total : r.to * STEP_M;
    return {
      kind: r.kind,
      start_m: r.from * STEP_M,
      distance_m: Math.round(end - r.from * STEP_M),
      grade_pct: round1(grade(r) * 100),
      gain_m: Math.round(gainBetween(r.from, r.to)),
    };
  });

  const profile: Array<[number, number]> = [];
  for (let p = 0; p < COURSE_PROFILE_POINTS; p += 1) {
    const k = Math.round((p / (COURSE_PROFILE_POINTS - 1)) * (n - 1));
    profile.push([k * STEP_M, round1(ele[k])]);
  }
  return {
    ok: true,
    course: { name, distance_m: Math.round(total), gain_m: Math.round(gainBetween(0, n - 1)), profile, segments },
  };
}
