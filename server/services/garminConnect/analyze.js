// Everything BikeLab derives from a Garmin ride's per-second data, computed
// once at ingest so the raw recording never has to be stored
// (docs/plans/garmin-connect-api.md §4, migration 1758000000019).
//
// The shapes are the ones the Strava pipeline already caches per ride in
// `activity_analysis`, so a reader can treat the two sources alike:
//   breakdown     — @bikelab/shared ridePowerBreakdown (kind 'ride_power');
//                   its `best_efforts_w` is the kind-'power' efforts map
//   hr_histogram  — services/hrZones.js computeHrHistogram (kind 'hr_histogram')
//   power_histogram — seconds at each watt, on moving time (new)
//
// One difference, on purpose: the breakdown is computed WITHOUT an FTP. The
// Strava pipeline can recompute when the rider's FTP moves because it still
// has (or can re-fetch) the streams; here there is nothing to recompute
// from. So IF / TSS / time-in-zones are left out at ingest and rebuilt on
// read by `breakdownWithFtp()` from NP, moving time and the watts histogram
// — exactly, not approximately (see test/garminAnalyze.test.js).
//
// Pure: plain objects in, plain objects out.
const zlib = require('zlib');
const { ridePowerBreakdown, toMovingOneHertz, powerZones } = require('@bikelab/shared/calc');
const { downsampleStreamsResponse } = require('../../lib/downsampleStreams');
const { computeHrHistogram } = require('../hrZones');

// Bump when any derived shape (or the calc behind it) changes:
// scripts/garmin-sync.js re-ingests rows below the current version.
const ANALYSIS_VERSION = 1;

// The ride screen draws a fixed-width chart; this is the most it asks for.
const CHART_POINTS = 600;
const CHART_KEYS = ['time', 'distance', 'altitude', 'velocity_smooth', 'heartrate', 'cadence', 'watts', 'latlng'];
// Decimals kept per stream in the stored chart — what a chart can show, not
// what the sensor reported. Fewer digits is most of the size saving.
const CHART_DECIMALS = { time: 0, distance: 0, altitude: 1, velocity_smooth: 2, heartrate: 0, cadence: 0, watts: 0 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Seconds spent at each whole watt, on moving time — the same 1 Hz series
 * ridePowerBreakdown averages over. `null` for a ride without a power meter.
 */
function powerHistogram(streams) {
  const watts = streams?.watts?.data;
  if (!Array.isArray(watts) || !watts.some((w) => isNum(w) && w > 0)) return null;
  const time = streams?.time?.data;
  const clean = watts.map((w) => (isNum(w) ? w : 0));
  const timeline = clean.map((_, i) => (isNum(time?.[i]) ? time[i] : i));
  const bins = {};
  const moving = toMovingOneHertz(timeline, clean);
  for (const w of moving) {
    const key = String(Math.round(w));
    bins[key] = (bins[key] || 0) + 1;
  }
  return { bins, total_seconds: moving.length };
}

/** The `analysis` JSONB stored with the ride. */
function analyzeStreams(streams) {
  return {
    version: ANALYSIS_VERSION,
    breakdown: ridePowerBreakdown(streams, { ftp: null }),
    hr_histogram: streams?.heartrate ? computeHrHistogram(streams) : null,
    power_histogram: powerHistogram(streams),
  };
}

/**
 * The stored breakdown with IF, TSS and time in Coggan zones filled in for
 * `ftp` — what ridePowerBreakdown(streams, { ftp }) would have returned, had
 * the streams been kept. Returned unchanged when there is no power meter or
 * no FTP.
 */
function breakdownWithFtp(analysis, ftp) {
  const breakdown = analysis?.breakdown ?? null;
  if (!breakdown || breakdown.source !== 'meter' || !(ftp > 0) || !isNum(breakdown.np_w)) return breakdown;
  const zones = powerZones(ftp);
  const zonesS = zones.map(() => 0);
  for (const [key, seconds] of Object.entries(analysis.power_histogram?.bins || {})) {
    const w = Number(key);
    const idx = zones.findIndex((z) => w >= z.minW && (z.maxW === null || w <= z.maxW));
    if (idx !== -1) zonesS[idx] += seconds;
  }
  const intensity = breakdown.np_w / ftp;
  return {
    ...breakdown,
    if_: Math.round(intensity * 100) / 100,
    tss: Math.round(((breakdown.moving_s * breakdown.np_w * intensity) / (ftp * 3600)) * 100),
    zones_s: zonesS,
  };
}

function roundTo(value, decimals) {
  if (!isNum(value)) return null;
  const k = 10 ** decimals;
  return Math.round(value * k) / k;
}

/**
 * Chart-sized streams (Strava `key_by_type` shape, ≤ CHART_POINTS per
 * stream, index-aligned) for the ride screen's charts and map.
 */
function chartStreams(streams) {
  const picked = {};
  for (const key of CHART_KEYS) {
    if (Array.isArray(streams?.[key]?.data)) picked[key] = { data: streams[key].data };
  }
  const reduced = downsampleStreamsResponse(picked, CHART_POINTS);
  const out = {};
  for (const [key, stream] of Object.entries(reduced)) {
    const data = key === 'latlng'
      ? stream.data.map((p) => (Array.isArray(p) ? [roundTo(p[0], 5), roundTo(p[1], 5)] : null))
      : stream.data.map((v) => roundTo(v, CHART_DECIMALS[key] ?? 2));
    out[key] = { ...stream, data };
  }
  return out;
}

/**
 * brotli(JSON) of chartStreams — the `chart` BYTEA. Brotli rather than the
 * gzip activity_streams uses: on this short, repetitive JSON it is ~30 %
 * smaller (≈7.5 KB instead of ≈11 KB a ride), and this blob is kept forever.
 */
function encodeChart(streams) {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(chartStreams(streams)), 'utf8'));
}

function decodeChart(blob) {
  return blob ? JSON.parse(zlib.brotliDecompressSync(blob).toString('utf8')) : null;
}

module.exports = {
  ANALYSIS_VERSION,
  CHART_POINTS,
  analyzeStreams,
  breakdownWithFtp,
  powerHistogram,
  chartStreams,
  encodeChart,
  decodeChart,
};
