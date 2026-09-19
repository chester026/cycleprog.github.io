// Pure data-shaping helpers behind the seven HR/cadence chart components
// (T-6.3 part 1, audit W-32: "7 near-identical chart components"). No React
// here — everything is a plain function so it is unit-testable without
// rendering, and so `TrendChart`/`ScatterChart`/`BarChart` (this directory)
// can consume its output directly as generic `{x, y, y2?}` points.
import { ACTIVITY_RIDE_TYPES } from '@bikelab/shared/constants';
import { getISOWeekNumber } from '@bikelab/shared/calc';

const MS_TO_KMH = 3.6;

/**
 * A ride activity: `ACTIVITY_RIDE_TYPES` (['Ride', 'VirtualRide']) matched
 * against either `sport_type` or the legacy `type` field.
 *
 * The pre-dedup components disagreed on this: `HeartRateVsSpeedChart` /
 * `AverageHeartRateTrendChart` / `MinMaxHeartRateBarChart` /
 * `HeartRateVsElevationChart` checked only `activity.type`, while the
 * cadence charts checked `sport_type` first, falling back to `type`. Using
 * the OR of both here (the cadence charts' behaviour) is a deliberate,
 * reported behaviour change: it's a superset, so no activity that used to
 * count stops counting, and it fixes the same activity being "not a ride"
 * on the HR charts but "a ride" on the cadence charts.
 */
export function isRideActivity(activity) {
  if (!activity) return false;
  return (
    ACTIVITY_RIDE_TYPES.includes(activity.sport_type) || ACTIVITY_RIDE_TYPES.includes(activity.type)
  );
}

export function filterRides(activities, extraFilter) {
  if (!activities || !activities.length) return [];
  return activities.filter((a) => isRideActivity(a) && (!extraFilter || extraFilter(a)));
}

/** `2024-03-12` -> `12/03` (en-GB day/month), matching every chart's original `formatDate`. */
export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
}

function sortByDate(rides, order) {
  return rides.slice().sort((a, b) => {
    const diff = new Date(a.start_date) - new Date(b.start_date);
    return order === 'desc' ? -diff : diff;
  });
}

/**
 * Trailing simple moving average over `values` (nulls in the trailing
 * window are ignored rather than propagating `null`). Not used by any of
 * the seven current chart components (none plotted one), but the audit
 * asked for it here so a future trend chart doesn't grow an 8th copy.
 */
export function movingAverage(values, window) {
  if (!window || window <= 1) return values.slice();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1).filter((v) => v != null);
    out.push(slice.length ? +(slice.reduce((sum, v) => sum + v, 0) / slice.length).toFixed(2) : null);
  }
  return out;
}

/**
 * Build chart-ready points from `activities`. See the per-mode comments
 * below for which of the seven components each mode replaces.
 *
 * @param {Array} activities
 * @param {object} options
 * @param {string} options.metric - activity field for the primary value (y).
 * @param {string} [options.metric2] - activity field for a second series (y2), 'recent' mode only.
 * @param {string} [options.xMetric] - activity field for the x value, 'scatter' mode only.
 * @param {'recent'|'weekly-avg'|'weekly-max'|'scatter'} [options.mode='recent']
 * @param {number} [options.limit] - cap on the number of most-recent rides considered.
 * @param {(activity: object) => boolean} [options.filter] - extra predicate, ANDed with the ride-type check.
 * @param {boolean} [options.metricToKmh] - convert `metric` from m/s to km/h ('recent' mode).
 * @param {boolean} [options.metric2ToKmh] - convert `metric2` from m/s to km/h ('recent' mode).
 * @param {number} [options.movingAverageWindow] - if set, adds a `yMa` moving-average field ('recent' mode).
 * @returns {Array<{x: string|number, y: number|null, y2?: number, date?: string, yMa?: number}>}
 */
export function useRideSeries(activities, options = {}) {
  const {
    metric,
    metric2,
    xMetric,
    mode = 'recent',
    limit,
    filter,
    metricToKmh = false,
    metric2ToKmh = false,
    movingAverageWindow,
  } = options;

  const rides = filterRides(activities, filter);
  if (!rides.length || !metric) return [];

  // 'weekly-avg': AverageHeartRateTrendChart, AverageCadenceTrendChart.
  // 'weekly-max': MinMaxHeartRateBarChart.
  if (mode === 'weekly-avg' || mode === 'weekly-max') {
    const weekMap = new Map();
    for (const a of rides) {
      const value = a[metric];
      if (!a.start_date || value == null) continue;
      const d = new Date(a.start_date);
      const year = d.getFullYear();
      const week = getISOWeekNumber(d);
      const key = `${year}-W${week}`;
      if (!weekMap.has(key)) weekMap.set(key, { year, week, sum: 0, count: 0, max: -Infinity });
      const bucket = weekMap.get(key);
      bucket.sum += value;
      bucket.count += 1;
      bucket.max = Math.max(bucket.max, value);
    }
    return Array.from(weekMap.entries())
      .map(([key, b]) => ({
        x: key,
        y: mode === 'weekly-avg' ? +(b.sum / b.count).toFixed(1) : b.max,
      }))
      .sort((a, b) => {
        const [ay, aw] = a.x.split('-W').map(Number);
        const [by, bw] = b.x.split('-W').map(Number);
        return ay !== by ? ay - by : aw - bw;
      });
  }

  // 'scatter': HeartRateVsElevationChart, CadenceVsElevationChart. Newest
  // `limit` rides, newest-first (not reversed) - matches the originals.
  if (mode === 'scatter') {
    const sorted = sortByDate(rides, 'desc');
    const sliced = limit ? sorted.slice(0, limit) : sorted;
    return sliced
      .map((a) => ({
        x: a[xMetric] || 0,
        y: a[metric] ?? null,
        date: formatShortDate(a.start_date),
      }))
      .filter((p) => p.y && p.x > 0);
  }

  // 'recent' (default): HeartRateVsSpeedChart, CadenceVsSpeedChart. Newest
  // `limit` rides, then reversed to oldest-first for a left-to-right timeline.
  const sorted = sortByDate(rides, 'desc');
  const sliced = (limit ? sorted.slice(0, limit) : sorted).slice().reverse();
  let points = sliced.map((a) => {
    const yRaw = a[metric];
    const y2Raw = metric2 ? a[metric2] : undefined;
    return {
      x: formatShortDate(a.start_date),
      y: yRaw != null ? (metricToKmh ? +(yRaw * MS_TO_KMH).toFixed(1) : yRaw) : null,
      y2: y2Raw != null ? (metric2ToKmh ? +(y2Raw * MS_TO_KMH).toFixed(1) : y2Raw) : undefined,
    };
  });
  points = metric2 ? points.filter((p) => p.y != null && p.y2 != null) : points.filter((p) => p.y != null);

  if (movingAverageWindow) {
    const ma = movingAverage(points.map((p) => p.y), movingAverageWindow);
    points = points.map((p, i) => ({ ...p, yMa: ma[i] }));
  }
  return points;
}
