// Pure helpers behind PowerInsights (ride screen's Power block) — what to
// say and which rows to compare, kept out of the component so the copy
// decisions are unit-tested without rendering. Design intent (owner,
// 06.11.2026): numbers should point at momentum and make the rider want to
// go again — ranks and gaps-to-best, never deficits; an easy ride is
// judged as an easy ride, not against sprint records.
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

/** Climbs worth a row: the longest first, at most `max`. */
export function climbRows(
  segments: RideSegmentDto[],
  max = 5,
): RideSegmentDto[] {
  return segments
    .filter(s => s.kind === 'climb' && s.distance_m >= 500)
    .sort((a, b) => b.distance_m - a.distance_m)
    .slice(0, max);
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
