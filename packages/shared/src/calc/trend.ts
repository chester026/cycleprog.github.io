/**
 * `computeMetricTrend` — reconciles `react-spa/src/utils/garageData.js:195`
 * and `BikeLabApp/src/utils/analyticsSnapshot.ts:90` (T-2.4,
 * docs/audit/layers/04-cross-layer.md §4.9, §6.1). Both computed the same
 * diff-between-latest-two-snapshots logic; the app's version was slightly
 * more defensive (explicit `Number.isFinite` checks) which this keeps.
 */

export interface MetricTrend {
  avg_power: number | null;
  avg_hr: number | null;
  avg_cadence: number | null;
}

export interface MetricSnapshotLike {
  avg_power?: unknown;
  avg_hr?: unknown;
  avg_cadence?: unknown;
  [key: string]: unknown;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Diff between the newest snapshot (`history[0]`) and the one before it
 * (`history[1]`), per field. Needs two real rows — with fewer, every field
 * comes back `null` so callers can hide the trend badge instead of showing
 * a misleading "+0".
 */
export function computeMetricTrend(
  history: MetricSnapshotLike[] | null | undefined
): MetricTrend {
  const empty: MetricTrend = { avg_power: null, avg_hr: null, avg_cadence: null };
  if (!Array.isArray(history) || history.length < 2) return empty;

  const [latest, previous] = history;
  const diff = (field: keyof MetricTrend): number | null => {
    const a = toFiniteNumber(latest?.[field]);
    const b = toFiniteNumber(previous?.[field]);
    return a !== null && b !== null ? Math.round(a - b) : null;
  };

  return {
    avg_power: diff('avg_power'),
    avg_hr: diff('avg_hr'),
    avg_cadence: diff('avg_cadence'),
  };
}
