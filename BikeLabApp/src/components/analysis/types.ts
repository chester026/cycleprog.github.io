// T-5.3 (docs/audit refs A-24, A-28): shared types/helpers for the five
// per-metric analysis components (PowerAnalysis/HeartAnalysis/SpeedAnalysis/
// CadenceAnalysis/FTPAnalysis). See README.md in this folder for the full
// diff of what these components share vs. what's genuinely metric-specific.
//
// All numbers still come from the server/`@bikelab/shared/calc` — this
// folder only reshapes *presentation* (stat cards, trend charts, activity
// lists), it does not add any new client-side computation.
import {getISOWeekNumber} from '@bikelab/shared/calc';

/** One card in a StatCardRow. */
export interface StatCardConfig {
  key: string;
  value: string | number;
  label: string;
  /** Renders a TrendBadge next to the value when set (only ever the
   * "average" card in the original components — PowerAnalysis/
   * HeartAnalysis/CadenceAnalysis; SpeedAnalysis never had a trend prop). */
  trend?: number | null;
  /** Power's "withWind"/"powerMeter" highlight cards. */
  backgroundColor?: string;
}

/** Subset of useChartOverlay()'s return value that TrendLineChart needs. */
export interface ChartOverlayApi {
  activeIndex: number | null;
  isInteracting: boolean;
  onTouchStart: () => void;
  clear: () => void;
  getPointerConfig: (color: string, stripHeight?: number) => Record<string, unknown>;
}

/** One row in ActivityMetricList (PowerAnalysis's "Top 5" cards). */
export interface ActivityMetricListItem {
  id: string;
  name: string;
  date: string;
  /** Already formatted, e.g. "245W". */
  valueLabel: string;
  /** e.g. the "Power meter" badge shown when the reading wasn't estimated. */
  badgeText?: string;
}

export interface WeeklyBucket {
  /** "{year}-W{week}", used for both grouping and sorting. */
  week: string;
  /** ISO week number as a display label ("34"). */
  label: string;
  avg: number;
  max: number;
  count: number;
}

/**
 * ISO-week grouping shared by Heart/Speed/Cadence's weekly-trend charts —
 * each metric used to carry its own copy of the same
 * `{[week]: {sum, count}}` reduction (see README.md "Weekly grouping").
 * Returns buckets sorted ascending by week; `slice` the result the way each
 * chart used to (e.g. `.slice(-26)`).
 */
export function groupActivitiesByIsoWeek<T>(
  items: T[],
  getDate: (item: T) => string | undefined | null,
  getValue: (item: T) => number | undefined | null,
): WeeklyBucket[] {
  const weekMap: {[key: string]: {sum: number; count: number; max: number}} = {};

  items.forEach(item => {
    const dateStr = getDate(item);
    const value = getValue(item);
    if (!dateStr || value == null) return;
    const d = new Date(dateStr);
    const week = getISOWeekNumber(d);
    const year = d.getFullYear();
    const key = `${year}-W${week}`;

    if (!weekMap[key]) weekMap[key] = {sum: 0, count: 0, max: 0};
    weekMap[key].sum += value;
    weekMap[key].count += 1;
    if (value > weekMap[key].max) weekMap[key].max = value;
  });

  return Object.entries(weekMap)
    .map(([key, val]) => ({
      week: key,
      label: key.split('-W')[1],
      avg: val.sum / val.count,
      max: val.max,
      count: val.count,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}
