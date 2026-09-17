// Bucket-average downsampling for Strava stream responses (T-3.6,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-
// layer.md §4.6, docs/audit/layers/02-bikelabapp.md A-04). Used by
// `GET /api/activities/:id/streams?downsample=<n>` so chart-only clients
// (RideAnalyticsScreen, GarageScreen) don't have to download/cache a whole
// ride's full-resolution streams (a 3h ride is ~10,800 points per field) —
// they only ever render a fixed-width chart anyway.
//
// Not used for FTP analysis (`services/ftpAnalysis.js`) — bucket-averaging
// coarsens exactly the short (>=120s), high-heart-rate spikes that analysis
// depends on, so that route always requests the full-resolution stream.
//
// `latlng` is bucket-*first* rather than averaged (you can't average two
// [lat, lng] pairs into a meaningful third one without real interpolation,
// and a polyline only needs to look plausible, not be exact) — every other
// numeric stream (`heartrate`, `cadence`, `watts`, `altitude`,
// `velocity_smooth`, `time`) is bucket-averaged. `time` is downsampled
// alongside everything else so the reduced arrays stay index-aligned.
const MAX_DOWNSAMPLE_POINTS = 2000;

function parseDownsampleParam(raw) {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, MAX_DOWNSAMPLE_POINTS);
}

function bucketRanges(length, targetPoints) {
  const ranges = [];
  const bucketSize = length / targetPoints;
  for (let b = 0; b < targetPoints; b += 1) {
    const start = Math.floor(b * bucketSize);
    const end = b === targetPoints - 1 ? length : Math.floor((b + 1) * bucketSize);
    if (start >= end) continue; // fewer source points than buckets in this range — skip, no data to represent
    ranges.push([start, end]);
  }
  return ranges;
}

function downsampleNumericArray(arr, targetPoints) {
  if (!Array.isArray(arr) || arr.length <= targetPoints) return arr;
  const ranges = bucketRanges(arr.length, targetPoints);
  return ranges.map(([start, end]) => {
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      const v = arr[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

function downsampleLatLngArray(arr, targetPoints) {
  if (!Array.isArray(arr) || arr.length <= targetPoints) return arr;
  const ranges = bucketRanges(arr.length, targetPoints);
  return ranges.map(([start]) => arr[start]);
}

/**
 * Downsamples every `{data: [...]}` stream field in a Strava streams
 * response object to at most `targetPoints` points each (bucket-average for
 * numeric series, bucket-first for `latlng`), keeping every field's array
 * the same reduced length so they stay aligned. Returns the input
 * unchanged when `targetPoints` is falsy or every stream already fits.
 */
function downsampleStreamsResponse(streams, targetPoints) {
  if (!targetPoints || !streams || typeof streams !== 'object') return streams;

  const result = {};
  for (const [key, stream] of Object.entries(streams)) {
    if (!stream || !Array.isArray(stream.data)) {
      result[key] = stream;
      continue;
    }
    const data = key === 'latlng' ? downsampleLatLngArray(stream.data, targetPoints) : downsampleNumericArray(stream.data, targetPoints);
    result[key] = { ...stream, data, original_size: stream.data.length, resolution: 'low' };
  }
  return result;
}

module.exports = { downsampleStreamsResponse, parseDownsampleParam, MAX_DOWNSAMPLE_POINTS };
