// Pure helpers behind PowerInsights (ride screen's Power block) — what to
// say and which rows to compare, kept out of the component so the copy
// decisions are unit-tested without rendering. Design intent (owner,
// 06.11.2026): numbers should point at momentum and make the rider want to
// go again — ranks and gaps-to-best, never deficits; an easy ride is
// judged as an easy ride, not against sprint records.
import type { RidePowerIntervalsModel } from '@bikelab/shared/types';
import type { RidePowerInsightsDto, RideSegmentDto } from '@bikelab/shared/api';

/** i18n key suffix for the 5s/1m/5m/20m/1h row labels. */
export function durationKey(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export type HeadlineKind = 'pr' | 'top';

export interface Headline {
  kind: HeadlineKind;
  /** Duration key of the effort. */
  subject: string;
  rank: number;
  total: number;
}

/**
 * One line that opens the block — only when the ride earned it: a best or
 * a top-3 effort in the window. A plain ride gets no sentence at all; the
 * effort score above already says what kind of day it was, and a fixed
 * phrase here only added weight (owner, 06.11).
 */
export function headline(insights: RidePowerInsightsDto): Headline | null {
  const h = insights.highlight;
  if (!h || h.total < 2) return null;
  return {
    kind: h.rank === 1 ? 'pr' : 'top',
    subject: durationKey(h.seconds),
    rank: h.rank,
    total: h.total,
  };
}

/**
 * Whether a row's gap-to-best / rank badge is worth showing. On an easy
 * ride (recovery/endurance) nobody was sprinting, so a 5-second rank there
 * is noise — unless the ride set a best or a top-3 anyway.
 */
export function showsComparison(
  insights: RidePowerInsightsDto,
  row: RidePowerInsightsDto['efforts'][number],
): boolean {
  if (row.watts === null || row.best_watts === null || row.total < 2)
    return false;
  if (row.is_pr || (row.rank !== null && row.rank <= 3)) return true;
  return (
    insights.intensity !== 'recovery' && insights.intensity !== 'endurance'
  );
}

/** Net grade a row must have to be listed as a climb, percent. */
export const MIN_CLIMB_GRADE_PCT = 3;

/** Climbs worth a row: the longest first, at most `max`. */
export function climbRows(
  segments: RideSegmentDto[],
  max = 5,
): RideSegmentDto[] {
  return (
    segments
      // Net grade too: a run classified as a climb can still end where it
      // started (a bump and its descent folded together) — 0.6 % is not a climb.
      .filter(
        s =>
          s.kind === 'climb' &&
          s.distance_m >= 500 &&
          s.grade_pct >= MIN_CLIMB_GRADE_PCT,
      )
      .sort((a, b) => b.distance_m - a.distance_m)
      .slice(0, max)
  );
}

/** The climb with the highest average power — the one to celebrate. */
export function bestClimb(rows: RideSegmentDto[]): RideSegmentDto | null {
  let best: RideSegmentDto | null = null;
  for (const r of rows)
    if (r.avg_w !== null && (best === null || r.avg_w > (best.avg_w as number)))
      best = r;
  return best;
}

export function formatKm(metres: number): string {
  return metres >= 10000
    ? `${Math.round(metres / 1000)} km`
    : `${(metres / 1000).toFixed(1)} km`;
}

/** "52:10" / "1:03:20" from seconds. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Signed percent, one decimal: "+9.2%" / "−3.4%" / "0.0%". */
export function formatSignedPct(pct: number): string {
  // One decimal: two durations rounding to the same whole percent read as a
  // bug ("−19% on both?"), and the calc already keeps one decimal.
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}%`;
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(1)}%`;
  return '0.0%';
}

/** "+2 W" / "−3 W" for the FTP change line. */
export function formatSignedWatts(watts: number): string {
  const rounded = Math.round(watts);
  return rounded < 0 ? `−${Math.abs(rounded)} W` : `+${rounded} W`;
}

/**
 * SVG paths for a small altitude profile: a smoothed line (Catmull-Rom →
 * cubic Bézier) through the samples scaled to width × height, and the same
 * line closed down to the baseline for the gradient fill. A flat profile
 * draws as a line along the middle.
 */
export function profilePaths(
  profile: number[],
  width: number,
  height: number,
): { line: string; area: string } {
  const pad = 2;
  const min = Math.min(...profile);
  const max = Math.max(...profile);
  const span = max - min;
  const n = profile.length;
  const pts = profile.map((a, k) => ({
    x: n === 1 ? 0 : (k / (n - 1)) * width,
    y:
      span > 0 ? pad + (1 - (a - min) / span) * (height - 2 * pad) : height / 2,
  }));
  const r = (v: number) => Math.round(v * 10) / 10;
  let line = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2.x)} ${r(p2.y)}`;
  }
  const area = `${line} L${r(pts[n - 1].x)} ${height} L${r(
    pts[0].x,
  )} ${height} Z`;
  return { line, area };
}

/**
 * The watts axis of the Intervals card's rows. With a target it is zoomed
 * around the target and the blocks (the target takes about 40 % of the
 * track, so it is seen), and blocks are dots on it; without one it runs from
 * zero to the strongest block, and blocks are bars.
 */
export function intervalsAxis(intervals: RidePowerIntervalsModel): {
  lo: number;
  span: number;
} {
  const watts = intervals.blocks.map(b => b.avgW);
  const { target } = intervals;
  if (!target) return { lo: 0, span: Math.max(1, ...watts) };
  const pad = Math.max(5, (target.high - target.low) * 0.75);
  const lo = Math.max(0, Math.min(target.low, ...watts) - pad);
  const hi = Math.max(target.high, ...watts) + pad;
  return { lo, span: hi - lo };
}

export interface IntervalsVerdict {
  hits: number;
  reps: number;
  /** 'up' — every effort met the target; 'over' — and at least one went above it. */
  tone: 'up' | 'over' | 'down' | 'neutral';
}

/**
 * The pill next to the set: how many efforts met the target — averaged
 * inside it or ABOVE it. Riding over the range is extra work, not a miss, so
 * it counts, and a set that met the target with an effort above it gets the
 * power colour instead of green. Red only when no effort got there. Null
 * without a target — two efforts that merely differ are not a structured
 * session to grade.
 */
export function intervalsVerdict(
  intervals: RidePowerIntervalsModel,
): IntervalsVerdict | null {
  const { set, target, blocks } = intervals;
  if (!set || !target) return null;
  const members = blocks.filter(b => b.inSet);
  const met = members.filter(b => b.vsTarget !== 'below').length;
  const over = members.some(b => b.vsTarget === 'above');
  return {
    hits: met,
    reps: set.reps,
    tone:
      met >= set.reps ? (over ? 'over' : 'up') : met === 0 ? 'down' : 'neutral',
  };
}

/** Below this intensity factor a ride was ridden easy on purpose. */
export const EASY_RIDE_IF = 0.7;

/** A ride ridden easy on purpose (IF under EASY_RIDE_IF): its numbers are not judged against the hard days. */
export function isEasyRide(
  intensityFactor: number | null | undefined,
): boolean {
  return (
    typeof intensityFactor === 'number' &&
    intensityFactor > 0 &&
    intensityFactor < EASY_RIDE_IF
  );
}
