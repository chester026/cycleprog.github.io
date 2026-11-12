import type { RidePowerCardModel } from '@bikelab/shared/types';
// Small pure helpers shared by the coach chat's power cards.

/** i18n key of the 5 s / 1 min / 5 min / 20 min / 1 h label. */
export function durationLabelKey(seconds: number): string {
  if (seconds < 60) return `coach.powerDuration.${seconds}s`;
  if (seconds < 3600) return `coach.powerDuration.${Math.round(seconds / 60)}m`;
  return `coach.powerDuration.${Math.round(seconds / 3600)}h`;
}

/** "14 Oct" from YYYY-MM-DD (or an ISO timestamp); the input back when unparsable. */
export function formatEffortDate(date: string): string {
  const d = new Date(date.length === 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: date.length === 10 ? 'UTC' : undefined,
  });
}

/** "52:10" / "1:03:20" from seconds. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatKm(metres: number): string {
  return metres >= 10000
    ? `${Math.round(metres / 1000)} km`
    : `${(metres / 1000).toFixed(1)} km`;
}

export type PacingTone = 'even' | 'negative' | 'faded' | 'surgy';

/** Same thresholds as shared/calc's pacingKind, on the card model's fields. */
export function pacingTone(
  vi: number,
  fadePct: number | null,
): PacingTone | null {
  if (fadePct === null) return null;
  if (fadePct <= -8) return 'faded';
  if (fadePct >= 5) return 'negative';
  if (vi >= 1.15) return 'surgy';
  return 'even';
}

export interface IntervalsPill {
  hits: number;
  reps: number;
  /** 'good' — every effort met the target; 'over' — and at least one went above it. */
  tone: 'good' | 'over' | 'bad' | 'neutral';
}

/**
 * The pill next to the set: how many efforts met the target — averaged
 * inside it or ABOVE it. Riding over the range is extra work, not a miss, so
 * it counts, and a set that met the target with an effort above it gets the
 * power colour instead of green. Red only when no effort got there. Null
 * without a target — two efforts that merely differ are not a structured
 * session to grade.
 */
export function intervalsPill(
  intervals: NonNullable<RidePowerCardModel['intervals']>,
): IntervalsPill | null {
  const { set, target, blocks } = intervals;
  if (!set || !target) return null;
  const members = blocks.filter(b => b.inSet);
  const met = members.filter(b => b.vsTarget !== 'below').length;
  const over = members.some(b => b.vsTarget === 'above');
  return {
    hits: met,
    reps: set.reps,
    tone:
      met >= set.reps
        ? over
          ? 'over'
          : 'good'
        : met === 0
        ? 'bad'
        : 'neutral',
  };
}
