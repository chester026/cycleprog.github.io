// Builds a small, synthetic FIT activity file in memory with Garmin's own
// encoder, for the Garmin ingest tests. Real rides are deliberately NOT
// checked in as fixtures: a FIT file is somebody's GPS track.
//
// `samples` are per-record readings; `t` is seconds from the start, so a
// jump in `t` is an auto-pause exactly as a head unit writes one (no records
// while the timer is stopped).
const FIT_EPOCH_S = 631065600;
const DEG_TO_SEMICIRCLES = 2 ** 31 / 180;

const DEFAULT_START = new Date('2026-06-01T06:00:00.000Z');

/** A steady ride: `seconds` one-second samples, optionally with a pause of `pauseS` after `pauseAt`. */
function steadySamples({ seconds = 600, watts = 200, hr = 140, cadence = 85, speed = 8, pauseAt = null, pauseS = 0, climb = 0 } = {}) {
  const samples = [];
  let t = 0;
  let distance = 0;
  for (let i = 0; i < seconds; i += 1) {
    if (pauseAt !== null && i === pauseAt) t += pauseS;
    samples.push({
      t,
      power: typeof watts === 'function' ? watts(i) : watts,
      heartRate: typeof hr === 'function' ? hr(i) : hr,
      cadence,
      speed,
      distance,
      altitude: 100 + climb * i,
      lat: 34.7 + i * 0.00005,
      lng: 33.05 + i * 0.00005,
    });
    t += 1;
    distance += speed;
  }
  return samples;
}

/**
 * Encodes a FIT activity. Returns a Buffer.
 *   sport / subSport — FIT enum names ('cycling' / 'road', 'running' / 'generic', …)
 *   session          — extra / overriding session fields (camelCase FIT names)
 *   sessions         — how many session messages to write (0 and 2 are the error cases)
 *   utcOffsetS       — written as the activity message's local timestamp; null omits the message
 */
async function buildFitRide({
  sport = 'cycling',
  subSport = 'road',
  start = DEFAULT_START,
  samples = steadySamples(),
  session = {},
  sessions = 1,
  utcOffsetS = 7200,
  // ANT+ device type numbers (11 = bike power, 120 = heart rate): the encoder
  // only takes the main field; the decoder expands it to `antplusDeviceType`.
  sensors = [{ deviceType: 11, manufacturer: 'stagesCycling' }, { deviceType: 120, manufacturer: 'wahooFitness' }],
} = {}) {
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const encoder = new Encoder();
  const at = (t) => new Date(start.getTime() + t * 1000);
  const last = samples.length ? samples[samples.length - 1].t : 0;
  const powered = samples.filter((s) => typeof s.power === 'number');

  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 3843, timeCreated: start });
  encoder.onMesg(Profile.MesgNum.DEVICE_INFO, { timestamp: start, deviceIndex: 'creator', manufacturer: 'garmin', product: 3843, sourceType: 'local' });
  sensors.forEach((sensor, i) => {
    encoder.onMesg(Profile.MesgNum.DEVICE_INFO, { timestamp: start, deviceIndex: i + 1, sourceType: 'antplus', ...sensor });
  });

  for (const s of samples) {
    const record = { timestamp: at(s.t) };
    if (typeof s.power === 'number') record.power = s.power;
    if (typeof s.heartRate === 'number') record.heartRate = s.heartRate;
    if (typeof s.cadence === 'number') record.cadence = s.cadence;
    if (typeof s.speed === 'number') record.enhancedSpeed = s.speed;
    if (typeof s.altitude === 'number') record.enhancedAltitude = s.altitude;
    if (typeof s.distance === 'number') record.distance = s.distance;
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      record.positionLat = Math.round(s.lat * DEG_TO_SEMICIRCLES);
      record.positionLong = Math.round(s.lng * DEG_TO_SEMICIRCLES);
    }
    encoder.onMesg(Profile.MesgNum.RECORD, record);
  }

  for (let i = 0; i < sessions; i += 1) {
    encoder.onMesg(Profile.MesgNum.SESSION, {
      timestamp: at(last),
      startTime: start,
      sport,
      subSport,
      totalElapsedTime: last,
      totalTimerTime: samples.length,
      totalDistance: samples.length ? samples[samples.length - 1].distance ?? 0 : 0,
      totalAscent: 12,
      totalDescent: 9,
      enhancedAvgSpeed: 8,
      enhancedMaxSpeed: 12.5,
      avgHeartRate: 140,
      maxHeartRate: 171,
      avgCadence: 85,
      ...(powered.length
        ? { avgPower: 200, maxPower: 420, normalizedPower: 210, totalWork: 120000, thresholdPower: 250, trainingStressScore: 12.3, intensityFactor: 0.84 }
        : {}),
      totalCalories: 150,
      avgTemperature: 21,
      totalTrainingEffect: 2.1,
      totalAnaerobicTrainingEffect: 0.3,
      ...session,
    });
  }

  if (utcOffsetS !== null) {
    encoder.onMesg(Profile.MesgNum.ACTIVITY, {
      timestamp: start,
      localTimestamp: Math.round(start.getTime() / 1000) - FIT_EPOCH_S + utcOffsetS,
      numSessions: sessions,
      type: 'manual',
      event: 'activity',
      eventType: 'stop',
    });
  }
  return Buffer.from(encoder.close());
}

module.exports = { buildFitRide, steadySamples, DEFAULT_START };
