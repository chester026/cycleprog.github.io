// services/garminConnect/analyze.js — what is derived from a Garmin ride at
// ingest and stored instead of its per-second data.
const { ridePowerBreakdown } = require('@bikelab/shared/calc');
const {
  ANALYSIS_VERSION,
  CHART_POINTS,
  analyzeStreams,
  breakdownWithFtp,
  powerHistogram,
  chartStreams,
  encodeChart,
  decodeChart,
} = require('../services/garminConnect/analyze');

// A 50-minute ride with a 10-minute café stop in the middle, power that
// wanders across every Coggan zone, and a climb.
function rideStreams({ seconds = 3000, withWatts = true } = {}) {
  const time = [];
  const watts = [];
  const heartrate = [];
  const cadence = [];
  const altitude = [];
  const velocity = [];
  const latlng = [];
  let t = 0;
  for (let i = 0; i < seconds; i += 1) {
    if (i === 1500) t += 600;
    time.push(t);
    t += 1;
    watts.push(i % 97 === 0 ? 0 : Math.round(150 + 140 * Math.sin(i / 37) + 60 * Math.sin(i / 5)));
    heartrate.push(Math.round(135 + 25 * Math.sin(i / 200)));
    cadence.push(i % 50 === 0 ? null : 85);
    altitude.push(100 + (i > 600 && i < 1400 ? (i - 600) * 0.4 : i >= 1400 ? 320 : 0));
    velocity.push(i > 600 && i < 1400 ? 4.5 : 9.123456);
    latlng.push([34.7 + i * 0.0000123, 33.05 + i * 0.0000456]);
  }
  return {
    time: { data: time },
    ...(withWatts ? { watts: { data: watts.map((w) => Math.max(0, w)) } } : {}),
    heartrate: { data: heartrate },
    cadence: { data: cadence },
    altitude: { data: altitude },
    velocity_smooth: { data: velocity },
    latlng: { data: latlng },
  };
}

describe('analyzeStreams', () => {
  it('stores the breakdown without an FTP, plus both histograms', () => {
    const analysis = analyzeStreams(rideStreams());
    expect(analysis.version).toBe(ANALYSIS_VERSION);
    expect(analysis.breakdown.source).toBe('meter');
    expect(analysis.breakdown.np_w).toBeGreaterThan(0);
    expect(analysis.breakdown.if_).toBeNull();
    expect(analysis.breakdown.tss).toBeNull();
    expect(analysis.breakdown.zones_s).toEqual([]);
    // The kind-'power' efforts map lives inside the breakdown.
    expect(analysis.breakdown.best_efforts_w).toMatchObject({ 5: expect.any(Number), 60: expect.any(Number), 1200: expect.any(Number) });
    expect(analysis.hr_histogram.source).toBe('streams');
    expect(analysis.hr_histogram.total_seconds).toBeGreaterThan(0);
    // Every moving second is in exactly one watt bin.
    const binned = Object.values(analysis.power_histogram.bins).reduce((a, b) => a + b, 0);
    expect(binned).toBe(analysis.power_histogram.total_seconds);
    expect(analysis.power_histogram.total_seconds).toBe(analysis.breakdown.moving_s);
  });

  it('has no power figures for a ride without a meter, but still a segment table and HR', () => {
    const analysis = analyzeStreams(rideStreams({ withWatts: false }));
    expect(analysis.breakdown.source).toBe('none');
    expect(analysis.breakdown.np_w).toBeNull();
    expect(analysis.breakdown.segments.length).toBeGreaterThan(0);
    expect(analysis.power_histogram).toBeNull();
    expect(analysis.hr_histogram.total_seconds).toBeGreaterThan(0);
  });

  it('survives a file with no heart-rate strap and no records', () => {
    const { heartrate: _heartrate, ...noHr } = rideStreams();
    expect(analyzeStreams(noHr).hr_histogram).toBeNull();
    const empty = analyzeStreams({ time: { data: [] } });
    expect(empty.breakdown.source).toBe('none');
    expect(empty.power_histogram).toBeNull();
  });
});

describe('breakdownWithFtp', () => {
  // The point of storing the histogram: IF / TSS / time in zones for any
  // FTP, later, must be what the calc would have produced from the streams.
  it.each([120, 177, 250, 333])('rebuilds IF, TSS and zones for FTP %i exactly as ridePowerBreakdown would', (ftp) => {
    const streams = rideStreams();
    const fromStreams = ridePowerBreakdown(streams, { ftp });
    const rebuilt = breakdownWithFtp(analyzeStreams(streams), ftp);
    expect(rebuilt).toEqual(fromStreams);
    expect(rebuilt.zones_s.reduce((a, b) => a + b, 0)).toBe(rebuilt.moving_s);
  });

  it('returns the stored breakdown untouched without an FTP or without a meter', () => {
    const analysis = analyzeStreams(rideStreams());
    expect(breakdownWithFtp(analysis, null)).toBe(analysis.breakdown);
    expect(breakdownWithFtp(analysis, 0)).toBe(analysis.breakdown);
    const noMeter = analyzeStreams(rideStreams({ withWatts: false }));
    expect(breakdownWithFtp(noMeter, 250)).toBe(noMeter.breakdown);
    expect(breakdownWithFtp(null, 250)).toBeNull();
    expect(breakdownWithFtp({}, 250)).toBeNull();
  });
});

describe('powerHistogram', () => {
  it('is null without a watts stream or when the meter never read above zero', () => {
    expect(powerHistogram({ time: { data: [0, 1] } })).toBeNull();
    expect(powerHistogram({ time: { data: [0, 1] }, watts: { data: [0, null] } })).toBeNull();
    expect(powerHistogram(null)).toBeNull();
  });

  it('counts seconds, not samples: a short gap holds the reading, a stop is cut out', () => {
    // 100 W held for 3 s, then a 10-minute stop, then 200 W for 1 s.
    const histogram = powerHistogram({ time: { data: [0, 3, 603] }, watts: { data: [100, 150, 200] } });
    expect(histogram).toEqual({ bins: { 100: 3, 150: 1, 200: 1 }, total_seconds: 5 });
  });

  it('works without a time stream (one sample a second)', () => {
    expect(powerHistogram({ watts: { data: [100, 100, 0] } })).toEqual({ bins: { 100: 2, 0: 1 }, total_seconds: 3 });
  });
});

describe('chart', () => {
  it('is at most CHART_POINTS per stream, index-aligned, rounded to what a chart shows', () => {
    const chart = chartStreams({ ...rideStreams(), temp: { data: [1, 2, 3] } });
    expect(Object.keys(chart).sort()).toEqual(['altitude', 'cadence', 'heartrate', 'latlng', 'time', 'velocity_smooth', 'watts']);
    for (const stream of Object.values(chart)) {
      expect(stream.data).toHaveLength(CHART_POINTS);
      expect(stream.original_size).toBe(3000);
    }
    expect(chart.velocity_smooth.data[0]).toBe(9.12);
    expect(Number.isInteger(chart.watts.data[10])).toBe(true);
    expect(chart.latlng.data[0]).toEqual([34.7, 33.05]);
    expect(String(chart.latlng.data[7][0]).split('.')[1].length).toBeLessThanOrEqual(5);
  });

  it('leaves a ride shorter than the chart alone', () => {
    const chart = chartStreams({ time: { data: [0, 1, 2] }, heartrate: { data: [100, null, 102.4] } });
    expect(chart.time.data).toEqual([0, 1, 2]);
    expect(chart.heartrate.data).toEqual([100, null, 102]);
  });

  it('round-trips through the stored blob, far smaller than the JSON', () => {
    const streams = rideStreams();
    const blob = encodeChart(streams);
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(decodeChart(blob)).toEqual(chartStreams(streams));
    expect(blob.length).toBeLessThan(JSON.stringify(chartStreams(streams)).length / 3);
    expect(decodeChart(null)).toBeNull();
  });
});
