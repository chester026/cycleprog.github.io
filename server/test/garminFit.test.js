// services/garminConnect/fit.js — FIT bytes → Strava-shaped summary and
// streams. The files are synthetic (test/fixtures/fitRide.js), written with
// Garmin's own encoder, so the test exercises the real decoder end to end.
const { parseFitActivity, recordsToStreams, rideType, FitParseError } = require('../services/garminConnect/fit');
const { buildFitRide, steadySamples, DEFAULT_START } = require('./fixtures/fitRide');

describe('parseFitActivity', () => {
  it('reads the session into Strava-named, Strava-unit summary fields', async () => {
    const { type, sport, subSport, summary } = await parseFitActivity(await buildFitRide());
    expect({ type, sport, subSport }).toEqual({ type: 'Ride', sport: 'cycling', subSport: 'road' });
    expect(summary).toMatchObject({
      start_date: DEFAULT_START.toISOString(),
      utc_offset_s: 7200,
      moving_time: 600,
      elapsed_time: 599,
      total_elevation_gain: 12,
      average_speed: 8,
      max_speed: 12.5,
      average_heartrate: 140,
      max_heartrate: 171,
      average_cadence: 85,
      average_watts: 200,
      max_watts: 420,
      weighted_average_watts: 210,
      kilojoules: 120,
      device_watts: true,
      average_temp: 21,
      device_name: 'Garmin Edge 1040',
    });
  });

  it("keeps Garmin's own figures apart, in provider", async () => {
    const { provider } = await parseFitActivity(await buildFitRide());
    expect(provider).toEqual({
      sport: 'cycling',
      sub_sport: 'road',
      np_w: 210,
      tss: 12.3,
      if: 0.84,
      ftp_w: 250,
      training_effect: 2.1,
      anaerobic_training_effect: 0.3,
      calories: 150,
      total_descent: 9,
      sensors: [
        { type: 'bikePower', manufacturer: 'stagesCycling' },
        { type: 'heartRate', manufacturer: 'wahooFitness' },
      ],
    });
  });

  it('turns records into index-aligned key_by_type streams, an auto-pause being a gap in time', async () => {
    const samples = steadySamples({ seconds: 120, pauseAt: 60, pauseS: 300 });
    const { streams } = await parseFitActivity(await buildFitRide({ samples }));
    expect(Object.keys(streams).sort()).toEqual(['altitude', 'cadence', 'distance', 'heartrate', 'latlng', 'time', 'velocity_smooth', 'watts']);
    for (const stream of Object.values(streams)) expect(stream.data).toHaveLength(120);
    expect(streams.time.data.slice(58, 62)).toEqual([58, 59, 360, 361]);
    expect(streams.watts.data[0]).toBe(200);
    expect(streams.velocity_smooth.data[0]).toBe(8);
    // Semicircles back to degrees, to the 6th decimal.
    expect(streams.latlng.data[1][0]).toBeCloseTo(34.70005, 5);
    expect(streams.latlng.data[1][1]).toBeCloseTo(33.05005, 5);
  });

  it('leaves out a stream nothing reported, and never claims a power meter without one', async () => {
    const samples = steadySamples({ seconds: 60 }).map(({ power: _power, lat: _lat, lng: _lng, ...rest }) => rest);
    const { streams, summary, provider } = await parseFitActivity(await buildFitRide({ samples, sensors: [] }));
    expect(streams.watts).toBeUndefined();
    expect(streams.latlng).toBeUndefined();
    expect(streams.heartrate.data).toHaveLength(60);
    expect(summary.device_watts).toBe(false);
    expect(summary.average_watts).toBeNull();
    expect(provider.np_w).toBeNull();
    expect(provider.sensors).toEqual([]);
  });

  it('has no UTC offset when the file carries no activity message', async () => {
    const { summary } = await parseFitActivity(await buildFitRide({ utcOffsetS: null }));
    expect(summary.utc_offset_s).toBeNull();
  });

  it('reads a negative, quarter-hour offset', async () => {
    const { summary } = await parseFitActivity(await buildFitRide({ utcOffsetS: -12600 }));
    expect(summary.utc_offset_s).toBe(-12600);
  });

  it.each([
    [Buffer.from('definitely not a FIT file'), 'not_fit'],
    [Buffer.alloc(0), 'not_fit'],
  ])('rejects bytes that are not a FIT file', async (bytes, code) => {
    await expect(parseFitActivity(bytes)).rejects.toMatchObject({ name: 'FitParseError', code });
  });

  it('rejects a file without a session, and a multisport file', async () => {
    await expect(parseFitActivity(await buildFitRide({ sessions: 0 }))).rejects.toMatchObject({ code: 'no_session' });
    const multi = parseFitActivity(await buildFitRide({ sessions: 2 }));
    await expect(multi).rejects.toBeInstanceOf(FitParseError);
    await expect(multi).rejects.toMatchObject({ code: 'multi_session' });
  });
});

describe('rideType', () => {
  it.each([
    ['cycling', 'road', 'Ride'],
    ['cycling', 'mountain', 'Ride'],
    ['cycling', 'gravelCycling', 'Ride'],
    ['cycling', 'indoorCycling', 'Ride'],
    ['cycling', null, 'Ride'],
    ['cycling', 'virtualActivity', 'VirtualRide'],
    ['eBiking', 'generic', 'EBikeRide'],
    ['cycling', 'eBikeMountain', 'EBikeRide'],
    ['running', 'generic', null],
    ['training', 'breathing', null],
    [null, null, null],
  ])('%s / %s → %s', (sport, subSport, expected) => {
    expect(rideType(sport, subSport)).toBe(expected);
  });
});

describe('recordsToStreams', () => {
  it('is an empty time stream for a file with no records', () => {
    expect(recordsToStreams([])).toEqual({ time: { data: [] } });
    expect(recordsToStreams(undefined)).toEqual({ time: { data: [] } });
  });

  it('skips records without a timestamp and falls back to the non-enhanced fields', () => {
    const t0 = new Date('2026-06-01T06:00:00Z');
    const streams = recordsToStreams([
      { timestamp: t0, speed: 5, altitude: 10, heartRate: 100 },
      { heartRate: 999 },
      { timestamp: new Date(t0.getTime() + 2000), enhancedSpeed: 6, enhancedAltitude: 11 },
    ]);
    expect(streams.time.data).toEqual([0, 2]);
    expect(streams.velocity_smooth.data).toEqual([5, 6]);
    expect(streams.altitude.data).toEqual([10, 11]);
    expect(streams.heartrate.data).toEqual([100, null]);
  });
});
