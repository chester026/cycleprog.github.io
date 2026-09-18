// Open-Meteo wind lookup, extracted out of `GET /api/weather/wind`'s route
// handler (T-3.5, docs/audit/00-AUDIT-AND-PLAN.md T-3.5) so
// `services/power.js`'s server-side estimation can reuse the exact same
// cached fetch instead of the old client pattern of calling this server's
// own `/api/weather/wind` endpoint over HTTP for itself. The route keeps
// serving raw Open-Meteo JSON (unchanged response shape for existing
// callers); this module additionally exposes `getWindForActivity`, which
// resolves one activity's coordinates + start hour down to a single
// `{speedMs, directionDeg}` reading (or `null` when unavailable) — the same
// per-hour lookup `PowerAnalysis.tsx`/`.jsx` used to do client-side.
const { externalHttp } = require('../lib/http');
const { createCache } = require('../lib/cache');

// Async cache (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24) — was a small
// bounded in-memory Map server.js's route already used, moved here (T-3.5)
// so both the route and services/power.js share one cache instead of the
// enrichment path re-hitting Open-Meteo for coordinates/dates the route
// already fetched (or vice versa) within the same 30min. Now behind
// lib/cache.js so a Redis-backed deploy shares this across instances too —
// same-coordinates weather lookups made by different instances no longer
// each cost their own Open-Meteo call.
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_CACHE_MAX = 500;
const weatherCache = createCache({ namespace: 'weather', ttlMs: WEATHER_CACHE_TTL_MS, max: WEATHER_CACHE_MAX });

async function getWeatherCache(key) {
  const data = await weatherCache.get(key);
  return data ?? null;
}

async function setWeatherCache(key, data) {
  await weatherCache.set(key, data);
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function isForecastWindow(dateKeyStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  return dateKeyStr >= dateStr(threeDaysAgo);
}

function buildWindApiUrl({ latitude, longitude, start_date, end_date }) {
  const useForecastAPI = isForecastWindow(dateStr(new Date(start_date)));
  if (useForecastAPI) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);
    return `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr(
      startDate
    )}&end_date=${dateStr(endDate)}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms&timezone=auto`;
  }
  return `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${start_date}&end_date=${end_date}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms`;
}

/** Fetches (or serves from cache) the raw Open-Meteo wind response for one lat/lng/date. */
async function fetchWind({ latitude, longitude, start_date, end_date }) {
  const apiUrl = buildWindApiUrl({ latitude, longitude, start_date, end_date });
  const cached = await getWeatherCache(apiUrl);
  if (cached) return cached;
  const response = await externalHttp.get(apiUrl, { timeout: 8000 });
  await setWeatherCache(apiUrl, response.data);
  return response.data;
}

/**
 * Resolves one Strava activity down to a `{speedMs, directionDeg}` wind
 * reading for its start hour, or `null` when the activity has no
 * coordinates or Open-Meteo has no data for that hour. Ported from
 * `PowerAnalysis`'s per-activity wind lookup (same hour-matching logic for
 * the forecast vs. archive API), minus the AsyncStorage/localStorage
 * caching and the 100ms artificial delay between calls — this is now one
 * server-side call per activity, budgeted by the caller
 * (`services/power.js`).
 */
async function getWindForActivity(activity) {
  if (!activity || !activity.start_date) return null;

  let lat, lng;
  if (Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2) {
    [lat, lng] = activity.start_latlng;
  } else if (Array.isArray(activity.end_latlng) && activity.end_latlng.length === 2) {
    [lat, lng] = activity.end_latlng;
  } else {
    return null;
  }

  const activityDate = new Date(activity.start_date);
  const dateKey = dateStr(activityDate);
  const data = await fetchWind({ latitude: lat, longitude: lng, start_date: dateKey, end_date: dateKey });
  if (!data || !data.hourly || !Array.isArray(data.hourly.time)) return null;

  const activityHour = activityDate.getHours();
  const useForecastAPI = isForecastWindow(dateKey);
  const hourIndex = useForecastAPI
    ? data.hourly.time.findIndex((time) => {
        const t = new Date(time);
        return dateStr(t) === dateKey && t.getHours() === activityHour;
      })
    : data.hourly.time.findIndex((time) => new Date(time).getHours() === activityHour);

  if (hourIndex === -1) return null;
  const speedMs = data.hourly.windspeed_10m?.[hourIndex];
  const directionDeg = data.hourly.winddirection_10m?.[hourIndex];
  if (speedMs === null || speedMs === undefined || directionDeg === null || directionDeg === undefined) return null;
  return { speedMs, directionDeg };
}

module.exports = { fetchWind, getWindForActivity, buildWindApiUrl, weatherCache, getWeatherCache, setWeatherCache };
