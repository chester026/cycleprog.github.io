// Pure helpers for the ride analysis modal (pages/ride/*): the route
// thumbnail projection, stream-to-chart mapping and the metrics grid rows.
// Ride math itself (zones, Ride Quality, the coach prompt) is
// `@bikelab/shared/calc`'s rideAnalysis, shared with the app.
import polyline from '@mapbox/polyline';

const MPS_TO_KMH = 3.6;

/**
 * Projects a `[lat, lng][]` track onto a `width`x`height` box as an SVG
 * path (`M x y L x y ...`). Equirectangular with a cos(lat) correction on
 * longitude, which is accurate enough for a ride-sized thumbnail; the
 * track is scaled uniformly and centred so its shape is not distorted.
 * Returns '' for fewer than two points.
 */
export function trackToSvgPath(coords, width, height, padding = 6) {
  if (!Array.isArray(coords) || coords.length < 2) return '';
  const lats = coords.map(([lat]) => lat);
  const lngs = coords.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const lngScale = Math.cos(midLatRad);

  const spanX = (maxLng - minLng) * lngScale;
  const spanY = maxLat - minLat;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  // A straight out-and-back along a parallel has zero vertical span; guard
  // both axes so the scale stays finite.
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const safeScale = Number.isFinite(scale) ? scale : 1;
  const offsetX = padding + (innerW - spanX * safeScale) / 2;
  const offsetY = padding + (innerH - spanY * safeScale) / 2;

  return coords
    .map(([lat, lng], i) => {
      const x = offsetX + (lng - minLng) * lngScale * safeScale;
      const y = offsetY + (maxLat - lat) * safeScale;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Decodes a Strava `summary_polyline` to `[lat, lng][]`; null when absent. */
export function decodeTrack(summaryPolyline) {
  if (!summaryPolyline) return null;
  const coords = polyline.decode(summaryPolyline);
  return coords.length > 0 ? coords : null;
}

/** `h:mm:ss` above an hour, `m:ss` below — the x-axis of the stream charts. */
export function formatElapsed(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/**
 * Pairs one stream with the time stream into TrendChart points
 * (`{x, y}`); falls back to the sample index when the ride has no time
 * stream. `transform` converts units (m/s → km/h).
 */
export function streamToSeries(values, timeData, transform = (v) => v) {
  if (!Array.isArray(values) || values.length === 0) return [];
  return values.map((v, i) => ({
    x: Array.isArray(timeData) && timeData[i] != null ? formatElapsed(timeData[i]) : String(i),
    y: transform(v),
  }));
}

const formatKm = (m) => `${(m / 1000).toFixed(1)} km`;
const formatMin = (s) => `${Math.round(s / 60)} min`;
const formatKmh = (mps) => `${(mps * MPS_TO_KMH).toFixed(1)} km/h`;
const formatM = (m) => `${Math.round(m)} m`;
const formatBpm = (v) => `${Math.round(v)} bpm`;
const formatRpm = (v) => `${Math.round(v)} rpm`;
const formatW = (v) => `${Math.round(v)} W`;
const formatC = (v) => `${Math.round(v)} °C`;

/**
 * The metrics grid rows — every summary number the ride carries, in a
 * fixed order; rows whose value the ride does not have are dropped rather
 * than shown as a dash.
 */
export function rideMetrics(activity) {
  if (!activity) return [];
  const rows = [
    ['Distance', activity.distance, formatKm],
    ['Moving time', activity.moving_time, formatMin],
    ['Elapsed time', activity.elapsed_time, formatMin],
    ['Avg speed', activity.average_speed, formatKmh],
    ['Max speed', activity.max_speed, formatKmh],
    ['Elevation gain', activity.total_elevation_gain, formatM],
    ['Max elevation', activity.elev_high, formatM],
    ['Avg heart rate', activity.average_heartrate, formatBpm],
    ['Max heart rate', activity.max_heartrate, formatBpm],
    ['Avg cadence', activity.average_cadence, formatRpm],
    ['Avg power', activity.average_watts, formatW],
    ['Max power', activity.max_watts, formatW],
    ['Est. power', activity.estimated_power?.avgWatts, formatW],
    ['Temperature', activity.average_temp, formatC],
  ];
  return rows
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([label, value, format]) => ({ label, value: format(value) }));
}

/** `/coach?prompt=…&activity=…` — the coach page reads both and checks for an existing thread itself. */
export function coachUrlForRide(prompt, activityId) {
  const params = new URLSearchParams({ prompt, activity: String(activityId) });
  return `/coach?${params.toString()}`;
}
