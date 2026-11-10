// FIT activity file → what the rest of the server already speaks: a
// Strava-shaped ride summary and Strava-shaped (`key_by_type`) streams.
//
// The FIT file is the one thing every Garmin transport hands over unchanged
// (the Personal API's download-service ZIP today, the Developer Program's
// activity-file push tomorrow) — their JSON summaries differ, the file does
// not — so everything BikeLab stores about a Garmin ride is derived from it
// here and nowhere else (docs/plans/garmin-connect-api.md §3).
//
// Pure: bytes in, plain objects out. No DB, no network, no logging.

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
const FIT_EPOCH_S = 631065600;
/** FIT stores positions as signed 32-bit "semicircles". */
const SEMICIRCLE_DEG = 180 / 2 ** 31;
const MAX_UTC_OFFSET_S = 14 * 3600;

class FitParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FitParseError';
    this.code = code;
  }
}

// @garmin/fitsdk is ESM-only. `import()` works on every Node 22; a bare
// `require()` of it only on 22.12+.
let sdkPromise;
function loadSdk() {
  sdkPromise ??= import('@garmin/fitsdk');
  return sdkPromise;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, digits = 0) => {
  const n = num(v);
  if (n === null) return null;
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/**
 * FIT sport / sub-sport → the Strava activity `type` the server filters
 * rides by (`Ride` / `VirtualRide` everywhere, see services/analytics.js);
 * `null` for anything that is not a bike ride.
 */
function rideType(sport, subSport) {
  if (sport === 'eBiking' || subSport === 'eBikeFitness' || subSport === 'eBikeMountain') return 'EBikeRide';
  if (sport !== 'cycling') return null;
  if (subSport === 'virtualActivity') return 'VirtualRide';
  return 'Ride';
}

/** "edge1040" → "Edge 1040", "wahooFitness" → "Wahoo Fitness". */
function humanize(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The recording device ("Garmin Edge 1040"), from the file's creator / file_id. */
function deviceName(messages) {
  const creator = (messages.deviceInfoMesgs || []).find((d) => d.deviceIndex === 'creator') || messages.fileIdMesgs?.[0];
  if (!creator) return null;
  const maker = humanize(creator.manufacturer);
  const product = humanize(creator.garminProduct ?? creator.productName ?? (typeof creator.product === 'string' ? creator.product : null));
  return [maker, product].filter(Boolean).join(' ') || null;
}

/** Paired sensors, one per kind: [{ type: 'bikePower', manufacturer: '4iiiis' }]. */
function sensors(messages) {
  const seen = new Map();
  for (const d of messages.deviceInfoMesgs || []) {
    if (d.sourceType !== 'antplus' && d.sourceType !== 'bluetoothLowEnergy' && d.sourceType !== 'bluetooth') continue;
    const type = typeof d.antplusDeviceType === 'string' ? d.antplusDeviceType : typeof d.bleDeviceType === 'string' ? d.bleDeviceType : null;
    if (!type) continue;
    const manufacturer = typeof d.manufacturer === 'string' && d.manufacturer !== 'development' ? d.manufacturer : null;
    if (!seen.has(type) || (manufacturer && !seen.get(type).manufacturer)) seen.set(type, { type, manufacturer });
  }
  return [...seen.values()];
}

/**
 * Seconds the rider's clock was ahead of UTC at the start, from the
 * activity message's local timestamp; null when the file doesn't say (or
 * says something that isn't a real offset).
 */
function utcOffsetSeconds(messages) {
  const activity = messages.activityMesgs?.[0];
  const local = num(activity?.localTimestamp);
  const utc = activity?.timestamp instanceof Date ? activity.timestamp.getTime() / 1000 : null;
  if (local === null || utc === null) return null;
  const offset = Math.round((local + FIT_EPOCH_S - utc) / 900) * 900;
  return Math.abs(offset) <= MAX_UTC_OFFSET_S ? offset : null;
}

/**
 * `record` messages → Strava `key_by_type` streams, every array the same
 * length. `time` is seconds from the first record, so an auto-pause is a
 * gap in it — the same convention Strava's streams use and the calc layer
 * (toOneHertz / toMovingOneHertz) is written for. A stream nothing in the
 * ride ever reported is left out, as Strava leaves it out.
 */
function recordsToStreams(records) {
  const rows = (records || []).filter((r) => r.timestamp instanceof Date);
  if (rows.length === 0) return { time: { data: [] } };
  const t0 = rows[0].timestamp.getTime();
  const columns = {
    time: rows.map((r) => Math.round((r.timestamp.getTime() - t0) / 1000)),
    watts: rows.map((r) => num(r.power)),
    heartrate: rows.map((r) => num(r.heartRate)),
    cadence: rows.map((r) => num(r.cadence)),
    altitude: rows.map((r) => num(r.enhancedAltitude ?? r.altitude)),
    velocity_smooth: rows.map((r) => num(r.enhancedSpeed ?? r.speed)),
    distance: rows.map((r) => num(r.distance)),
    temp: rows.map((r) => num(r.temperature)),
    latlng: rows.map((r) => {
      const lat = num(r.positionLat);
      const lng = num(r.positionLong);
      return lat === null || lng === null ? null : [round(lat * SEMICIRCLE_DEG, 6), round(lng * SEMICIRCLE_DEG, 6)];
    }),
  };
  const streams = {};
  for (const [key, data] of Object.entries(columns)) {
    if (key === 'time' || data.some((v) => v !== null)) streams[key] = { data };
  }
  return streams;
}

/**
 * Decodes one FIT activity file.
 *
 * Returns `{ sport, subSport, type, summary, provider, streams }`:
 *   type     — Strava-style ride type, or null when the file is not a bike ride
 *   summary  — the garmin_activities summary columns (metres, seconds, m/s, W)
 *   provider — Garmin's own figures for the ride, kept apart from BikeLab's
 *   streams  — Strava `key_by_type` shape
 *
 * Throws FitParseError (`not_fit`, `no_session`, `multi_session`) for a file
 * it can't turn into one ride.
 */
async function parseFitActivity(buffer) {
  const { Decoder, Stream } = await loadSdk();
  const decoder = new Decoder(Stream.fromBuffer(buffer));
  if (!decoder.isFIT()) throw new FitParseError('not_fit', 'Not a FIT file');
  const { messages } = decoder.read();

  const sessions = messages.sessionMesgs || [];
  if (sessions.length === 0) throw new FitParseError('no_session', 'FIT file has no session message');
  // A multisport recording (triathlon) is several sessions over one record
  // stream; splitting it is not worth doing until someone asks.
  if (sessions.length > 1) throw new FitParseError('multi_session', 'FIT file holds more than one session');
  const s = sessions[0];
  if (!(s.startTime instanceof Date)) throw new FitParseError('no_session', 'FIT session has no start time');

  const streams = recordsToStreams(messages.recordMesgs);
  const deviceWatts = !!streams.watts && streams.watts.data.some((w) => w !== null && w > 0);
  const sport = typeof s.sport === 'string' ? s.sport : null;
  const subSport = typeof s.subSport === 'string' ? s.subSport : null;

  return {
    sport,
    subSport,
    type: rideType(sport, subSport),
    summary: {
      start_date: s.startTime.toISOString(),
      utc_offset_s: utcOffsetSeconds(messages),
      distance: round(s.totalDistance, 1),
      moving_time: round(s.totalTimerTime),
      elapsed_time: round(s.totalElapsedTime),
      total_elevation_gain: round(s.totalAscent, 1),
      average_speed: round(s.enhancedAvgSpeed ?? s.avgSpeed, 3),
      max_speed: round(s.enhancedMaxSpeed ?? s.maxSpeed, 3),
      average_heartrate: num(s.avgHeartRate),
      max_heartrate: num(s.maxHeartRate),
      average_cadence: num(s.avgCadence),
      average_watts: num(s.avgPower),
      max_watts: num(s.maxPower),
      weighted_average_watts: num(s.normalizedPower),
      kilojoules: num(s.totalWork) === null ? null : round(s.totalWork / 1000, 1),
      // FIT carries no estimated power: watts in the file came from a meter.
      device_watts: deviceWatts,
      average_temp: num(s.avgTemperature),
      device_name: deviceName(messages),
    },
    provider: {
      sport,
      sub_sport: subSport,
      np_w: num(s.normalizedPower),
      tss: round(s.trainingStressScore, 1),
      if: round(s.intensityFactor, 3),
      ftp_w: num(s.thresholdPower),
      training_effect: round(s.totalTrainingEffect, 1),
      anaerobic_training_effect: round(s.totalAnaerobicTrainingEffect, 1),
      calories: num(s.totalCalories),
      total_descent: round(s.totalDescent, 1),
      sensors: sensors(messages),
    },
    streams,
  };
}

module.exports = { parseFitActivity, recordsToStreams, rideType, FitParseError, FIT_EPOCH_S, SEMICIRCLE_DEG };
