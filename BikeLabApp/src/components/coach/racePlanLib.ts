// Pure helpers of the coach chat's race plan card (RacePlanCard.tsx).
import type {
  RacePlanCardModel,
  RacePlanSegmentItem,
} from '@bikelab/shared/types';

/** "3:20" for a race, "48 min" under an hour. */
export function formatRaceTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Climbs listed on the card at most — three rows of two; the rest are counted. */
export const CARD_MAX_CLIMB_ROWS = 6;

/** The climbs worth a row — the longest ones, in riding order — and how many were left out. */
export function climbRows(model: RacePlanCardModel): {
  rows: RacePlanSegmentItem[];
  more: number;
} {
  const climbs = model.segments.filter(s => s.kind === 'climb');
  const rows = [...climbs]
    .sort((a, b) => b.distanceM - a.distanceM)
    .slice(0, CARD_MAX_CLIMB_ROWS)
    .sort((a, b) => a.startM - b.startM);
  return { rows, more: climbs.length - rows.length };
}

/**
 * The watts range most flat kilometres are planned at, and how many flat
 * metres the course has in all; null on a course without flats.
 */
export function flatRange(
  model: RacePlanCardModel,
): { low: number; high: number; metres: number } | null {
  const byRange = new Map<
    string,
    { low: number; high: number; metres: number }
  >();
  let total = 0;
  for (const s of model.segments) {
    if (s.kind !== 'flat') continue;
    const key = `${s.lowW}-${s.highW}`;
    const entry = byRange.get(key) ?? { low: s.lowW, high: s.highW, metres: 0 };
    entry.metres += s.distanceM;
    total += s.distanceM;
    byRange.set(key, entry);
  }
  let best: { low: number; high: number; metres: number } | null = null;
  for (const entry of byRange.values())
    if (!best || entry.metres > best.metres) best = entry;
  return best ? { low: best.low, high: best.high, metres: total } : null;
}

export interface ProfileShape {
  /** Closed area under the altitude line, in a 0..width × 0..height box. */
  area: string;
  /** The altitude line itself. */
  line: string;
  /** Climb bands: x and width of each climb segment. */
  climbs: Array<{ x: number; width: number }>;
  /** Feed marks: x of each feed. */
  feeds: number[];
}

/** The course profile as SVG paths, with where the climbs and the feeds sit along it. Null without a profile. */
export function profileShape(
  model: RacePlanCardModel,
  width: number,
  height: number,
): ProfileShape | null {
  const { profile } = model;
  if (profile.length < 2) return null;
  const total = profile[profile.length - 1][0] || 1;
  const eles = profile.map(p => p[1]);
  const min = Math.min(...eles);
  const span = Math.max(1, Math.max(...eles) - min);
  const x = (m: number) =>
    Math.round((Math.min(total, Math.max(0, m)) / total) * width * 10) / 10;
  // The line keeps a little air above the highest point and a base below the lowest.
  const y = (ele: number) =>
    Math.round((height - 4 - ((ele - min) / span) * (height - 10)) * 10) / 10;
  const line = profile
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0])},${y(p[1])}`)
    .join(' ');
  return {
    line,
    area: `${line} L${width},${height} L0,${height} Z`,
    climbs: model.segments
      .filter(s => s.kind === 'climb')
      .map(s => ({
        x: x(s.startM),
        width: Math.max(1, x(s.startM + s.distanceM) - x(s.startM)),
      })),
    feeds: model.feeds.map(f => x(f.atM)),
  };
}
