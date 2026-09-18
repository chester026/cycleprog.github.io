// Data layer for the Garage page.
//
// The mobile app reads its garage numbers from /api/analytics-snapshot/latest,
// but that table is written ONLY by the mobile Analysis screen — for a
// web-only account the row is absent. So the snapshot is treated as the
// preferred source and raw /api/activities aggregates as the fallback, which
// keeps the web page populated either way.
//
// Monthly average speed has no endpoint at all (there is no monthly
// aggregation anywhere in the backend), so it is derived client-side with the
// same mean-of-means formula the app's BestAvgSpeedWidget uses.

// T-6.2 (audit W-18): `loadActivities`'s own `activities_${userId}`
// localStorage TTL cache (and the `getUserId()`/jwt-decode it needed to
// build that key) is gone — GaragePage/AnalysisPage now read activities
// through `useActivities()` (src/data/hooks), which shares one TanStack
// Query cache entry with every other page instead of each keeping its own
// stale copy (the "10 Wind Adjusted" bug this audit item names). Only the
// pure, cache-free calculations below stay in this module.
import { msToKmh, computeMetricTrend } from '@bikelab/shared/calc';
import { formatBadgeValue } from '@bikelab/shared/constants';

const RIDE_TYPES = ['Ride', 'VirtualRide'];

export function pickLastRide(activities) {
  return (
    activities
      .filter(a => RIDE_TYPES.includes(a.type))
      .slice()
      .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0] || null
  );
}

// Last `months` calendar months, oldest first. Mean of per-ride average speed,
// matching the app (note: a mean of means, not distance-weighted).
export function monthlyAvgSpeed(activities, months = 6) {
  const now = new Date();
  const out = [];

  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const speeds = activities
      .filter(a => {
        if (!a.start_date) return false;
        const t = new Date(a.start_date);
        return t.getFullYear() === month.getFullYear() && t.getMonth() === month.getMonth();
      })
      .map(a => msToKmh(a.average_speed || 0))
      .filter(v => v > 0);

    out.push({
      label: month.toLocaleString('en-US', { month: 'short' }),
      speed: speeds.length ? speeds.reduce((s, v) => s + v, 0) / speeds.length : 0
    });
  }

  return out;
}

function aggregate(rides, avgField, maxField) {
  const avgs = rides.map(a => a[avgField]).filter(v => typeof v === 'number' && v > 0);
  if (!avgs.length) return { avg: null, max: null };

  const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  const maxes = maxField
    ? rides.map(a => a[maxField]).filter(v => typeof v === 'number' && v > 0)
    : [];

  return { avg, max: maxes.length ? Math.max(...maxes) : Math.max(...avgs) };
}

// Strava's summary activities carry no max_cadence, so the cadence "max" is
// the highest per-ride average — the same compromise the app's snapshot makes.
export function metricsFromActivities(activities) {
  const rides = activities.filter(a => RIDE_TYPES.includes(a.type));
  const power = aggregate(rides, 'average_watts', 'max_watts');
  const hr = aggregate(rides, 'average_heartrate', 'max_heartrate');
  const cadence = aggregate(rides, 'average_cadence', null);

  return {
    avg_power: power.avg,
    max_power: power.max,
    avg_hr: hr.avg,
    max_hr: hr.max,
    avg_cadence: cadence.avg,
    max_cadence: cadence.max,
    vo2max: null
  };
}

// buildSnapshotPayload (and its aggregateMinMax helper) used to build the
// POST /api/analytics-snapshot body here — removed (T-3.3, docs/audit/00-
// AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/04-cross-layer.md §5.4): the
// server now computes and writes analytics_snapshots itself
// (server/services/analyticsSnapshot.js, called from GET /api/skills).
// The former `loadSnapshot`/`loadSnapshotHistory` fetch wrappers here moved
// to `src/data/hooks/useAnalyticsSnapshotHistory.js` (T-6.2) — GaragePage
// now reads `history[0]` as "the latest snapshot" instead of this module
// making a second `/api/analytics-snapshot/latest` request.

// computeMetricTrend moved to @bikelab/shared/calc (T-2.4, reconciled with
// BikeLabApp/src/utils/analyticsSnapshot.ts's copy) — re-exported here so
// existing `import { computeMetricTrend } from './garageData'` call sites
// keep working unchanged.
export { computeMetricTrend };

// VO2max is estimated server-side inside the analytics summary (the only
// place the web can get it without the mobile snapshot) — GaragePage reads
// it off `useAnalyticsSummary()`'s `summary.vo2max` instead of this module
// making its own `/api/analytics/summary` request.

// The analytics_snapshots columns are all Postgres NUMERIC (chosen to avoid
// float rounding on values like avg_power), and node-postgres returns NUMERIC
// as a string, not a JS number — "149", not 149. A strict `typeof === 'number'`
// check on the raw snapshot silently treats every one of those as absent and
// falls back to the computed estimate, which is exactly why the Garage widget
// kept showing an obviously-wrong Avg Power despite the DB row being correct.
// `numeric()` coerces string/number/null alike into a real number or null.
function numeric(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

// Snapshot wins per field; anything it lacks falls back to the computed value.
export function mergeMetrics(snapshot, computed, vo2maxFallback) {
  const pick = field => {
    const fromSnapshot = snapshot ? numeric(snapshot[field]) : null;
    return fromSnapshot !== null ? fromSnapshot : computed[field];
  };

  const snapshotVo2max = snapshot ? numeric(snapshot.vo2max) : null;

  return {
    avg_power: pick('avg_power'),
    max_power: pick('max_power'),
    avg_hr: pick('avg_hr'),
    max_hr: pick('max_hr'),
    avg_cadence: pick('avg_cadence'),
    max_cadence: pick('max_cadence'),
    vo2max:
      snapshotVo2max !== null
        ? snapshotVo2max
        : (typeof vo2maxFallback === 'number' ? vo2maxFallback : null)
  };
}

// formatBadgeValue moved to @bikelab/shared/constants (T-2.4, reconciled
// with BikeLabApp/src/components/achievements/helpers.ts's copy) —
// re-exported here so `import { formatBadgeValue } from './garageData'`
// call sites keep working unchanged.
export { formatBadgeValue };

// 3 most recently unlocked + 3 closest to unlocking, as on the app's screen.
export function pickGarageAchievements(achievements, limit = 6) {
  const list = Array.isArray(achievements) ? achievements : [];
  const unlocked = list
    .filter(a => a.unlocked)
    .sort((a, b) => new Date(b.unlocked_at || 0) - new Date(a.unlocked_at || 0))
    .slice(0, 3);
  const locked = list
    .filter(a => !a.unlocked)
    .sort((a, b) => (b.progress_pct || 0) - (a.progress_pct || 0))
    .slice(0, 3);

  return [...unlocked, ...locked].slice(0, limit);
}

// `loadAchievements`/`loadUserProfile` moved to `useAchievements()`/
// `useProfile()` (src/data/hooks) — GaragePage passes their `.achievements`
// / profile data straight into `pickGarageAchievements` above.
