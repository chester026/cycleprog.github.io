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

import { apiFetch } from './api';
import { cacheUtils, CACHE_KEYS } from './cache';
import { jwtDecode } from 'jwt-decode';

const RIDE_TYPES = ['Ride', 'VirtualRide'];
const ACTIVITIES_TTL = 30 * 60 * 1000;

export function getUserId() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) return null;
  try {
    return jwtDecode(token).userId ?? null;
  } catch {
    return null;
  }
}

function activitiesCacheKey() {
  const userId = getUserId();
  return userId ? `${CACHE_KEYS.ACTIVITIES}_${userId}` : CACHE_KEYS.ACTIVITIES;
}

// Shares the cache key the rest of the app already uses, so opening the garage
// does not add a second /api/activities round trip.
export async function loadActivities() {
  const key = activitiesCacheKey();
  const cached = cacheUtils.get(key);
  if (cached) return cached;

  const data = await apiFetch('/api/activities');
  const list = Array.isArray(data) ? data : [];
  cacheUtils.set(key, list, ACTIVITIES_TTL);
  return list;
}

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
      .map(a => (a.average_speed || 0) * 3.6)
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

// Same idea as `aggregate()` above but also returns the min of the per-ride
// averages — only the analytics-snapshot payload below needs that.
function aggregateMinMax(rides, avgField, maxField) {
  const avgs = rides.map(a => a[avgField]).filter(v => typeof v === 'number' && v > 0);
  if (!avgs.length) return { avg: null, max: null, min: null };

  const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  const maxes = maxField
    ? rides.map(a => a[maxField]).filter(v => typeof v === 'number' && v > 0)
    : [];

  return {
    avg,
    max: maxes.length ? Math.max(...maxes) : Math.max(...avgs),
    min: Math.min(...avgs)
  };
}

// Builds the body for POST /api/analytics-snapshot, the same endpoint the
// mobile app's Analysis screen posts to. Power MUST come from the caller's
// already-computed PowerAnalysis stats (real power-meter reading when the
// rider has one, otherwise its physics-model estimate) — never Strava's raw
// average_watts, which is exactly the value this snapshot exists to replace
// wherever avg power is shown (see mergeMetrics below).
//
// Heart/speed/cadence are plain Strava aggregates — nothing fancy needed
// there — but they still have to be included and non-null, because the
// backend upserts one full row per user per day: an incomplete payload would
// null out whatever the mobile app already saved for today.
export function buildSnapshotPayload(activities, powerStats, vo2max) {
  if (!powerStats || typeof powerStats.avgPower !== 'number') return null;
  if (typeof vo2max !== 'number') return null;

  const rides = activities.filter(a => RIDE_TYPES.includes(a.type));
  if (!rides.length) return null;

  const heart = aggregateMinMax(rides, 'average_heartrate', 'max_heartrate');
  const speed = aggregateMinMax(rides, 'average_speed', 'max_speed');
  const cadence = aggregateMinMax(rides, 'average_cadence', null);
  if (heart.avg === null || speed.avg === null || cadence.avg === null) return null;

  const lastActivityId = rides
    .slice()
    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0]?.id;
  if (!lastActivityId) return null;

  return {
    lastActivityId,
    power: { avg: powerStats.avgPower, max: powerStats.maxPower ?? null, min: powerStats.minPower ?? null },
    heart,
    speed,
    cadence,
    vo2max,
    activitiesCount: rides.length
  };
}

export async function loadSnapshot() {
  try {
    const res = await apiFetch('/api/analytics-snapshot/latest');
    return res && typeof res === 'object' ? res : null;
  } catch {
    return null;
  }
}

// Last N snapshots, newest first — used to show a +/- trend badge (Avg
// Power/HR/Cadence) next to whatever mergeMetrics() already displays.
export async function loadSnapshotHistory(limit = 2) {
  try {
    const res = await apiFetch(`/api/analytics-snapshot/history?limit=${limit}`);
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

// Diff between the newest snapshot and the one before it, per field. Needs
// two real rows — with fewer, every field comes back null so callers can
// hide the badge instead of showing a misleading "+0". Same numeric()
// coercion as mergeMetrics(), since these are the same NUMERIC columns.
export function computeMetricTrend(history) {
  const empty = { avg_power: null, avg_hr: null, avg_cadence: null };
  if (!Array.isArray(history) || history.length < 2) return empty;

  const [latest, previous] = history;
  const diff = field => {
    const a = numeric(latest?.[field]);
    const b = numeric(previous?.[field]);
    return a !== null && b !== null ? Math.round(a - b) : null;
  };

  return {
    avg_power: diff('avg_power'),
    avg_hr: diff('avg_hr'),
    avg_cadence: diff('avg_cadence')
  };
}

// VO2max is estimated server-side inside the analytics summary; it is the only
// place the web can get it without the mobile snapshot.
export async function loadSummaryVo2max() {
  try {
    const res = await apiFetch('/api/analytics/summary');
    const value = res?.summary?.vo2max;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

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

// The achievements API has no unit column — the unit is derived from `metric`,
// mirroring the app's helpers so both surfaces label badges identically.
export function formatBadgeValue(threshold, metric) {
  const t = Number(threshold) || 0;
  const asK = t >= 1000 ? `${Math.round(t / 1000)}k` : `${t}`;

  switch (metric) {
    case 'hr_intensity':
      return { value: `${Math.round(t * 100)}`, unit: 'max HR' };
    case 'hr_intensity_rides':
      return { value: `${t}`, unit: 'rides' };
    case 'weekly_streak':
      return { value: `${t}`, unit: 'weeks' };
    case 'total_distance':
    case 'distance':
      return { value: asK, unit: 'km' };
    case 'total_elevation_gain':
    case 'elevation_gain':
      return { value: asK, unit: 'meters' };
    case 'average_speed':
    case 'max_speed':
    case 'focus_max_speed':
      return { value: `${t}`, unit: 'km/h' };
    case 'average_watts':
      return { value: `${t}`, unit: 'watts' };
    case 'average_cadence':
      return { value: `${t}`, unit: 'rpm' };
    default:
      return { value: `${t}`, unit: '' };
  }
}

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

export async function loadAchievements() {
  try {
    const res = await apiFetch('/api/achievements/me');
    return Array.isArray(res?.achievements) ? res.achievements : [];
  } catch {
    return [];
  }
}

export async function loadUserProfile() {
  try {
    return await apiFetch('/api/user-profile');
  } catch {
    return null;
  }
}
