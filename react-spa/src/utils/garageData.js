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

export async function loadSnapshot() {
  try {
    const res = await apiFetch('/api/analytics-snapshot/latest');
    return res && typeof res === 'object' ? res : null;
  } catch {
    return null;
  }
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

// Snapshot wins per field; anything it lacks falls back to the computed value.
export function mergeMetrics(snapshot, computed, vo2maxFallback) {
  const pick = field =>
    snapshot && typeof snapshot[field] === 'number' ? snapshot[field] : computed[field];

  return {
    avg_power: pick('avg_power'),
    max_power: pick('max_power'),
    avg_hr: pick('avg_hr'),
    max_hr: pick('max_hr'),
    avg_cadence: pick('avg_cadence'),
    max_cadence: pick('max_cadence'),
    vo2max:
      snapshot && typeof snapshot.vo2max === 'number'
        ? snapshot.vo2max
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
