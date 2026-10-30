import { describe, expect, it } from 'vitest';
import {
  averageOf,
  computeRideAnalysis,
  formatRideDate,
  prepareChartData,
  rideCoachPrompt,
  rideQualityBand,
  rideQualityColor,
  rideQualityFor,
} from './rideAnalysis.js';
import type { RideAnalysisActivity } from './rideAnalysis.js';
import { RIDE_QUALITY_COLORS, RIDE_QUALITY_COPY_EN } from '../constants/rideQuality.js';
import type { RideQualityCopy } from '../constants/rideQuality.js';

const copy: RideQualityCopy = {
  poor: { label: 'Poor', advice: 'Sleep more.' },
  belowAvg: { label: 'Below Avg', advice: 'Recover.' },
  average: { label: 'Average', advice: 'Check pacing.' },
  good: { label: 'Good', advice: 'Solid effort.' },
  wellDone: { label: 'Well done', advice: 'Keep pushing!' },
  excellent: { label: 'Excellent', advice: 'In form!' },
  awesome: { label: 'Awesome!', advice: 'Machine mode!' },
};

const baseActivity = (overrides: Partial<RideAnalysisActivity> = {}): RideAnalysisActivity => ({
  distance: 30000,
  total_elevation_gain: 100,
  average_speed: 8,
  max_speed: 12,
  max_heartrate: 180,
  ...overrides,
});

describe('formatRideDate', () => {
  it('formats as dd.mm.yyyy with zero padding', () => {
    expect(formatRideDate(new Date(2024, 2, 5, 8))).toBe('05.03.2024');
    expect(formatRideDate('2024-03-05T08:00:00Z')).toMatch(/^\d{2}\.\d{2}\.2024$/);
  });
});

describe('prepareChartData', () => {
  it('returns an empty array for no data', () => {
    expect(prepareChartData([])).toEqual([]);
    expect(prepareChartData(null)).toEqual([]);
  });

  it('downsamples to at most 40 points and keeps value/index/text', () => {
    const data = Array.from({ length: 400 }, (_, i) => i);
    const result = prepareChartData(data);
    expect(result).toHaveLength(40);
    expect(result[0]).toEqual({ value: 0, index: 0, dataPointText: '0' });
    expect(result[1]).toEqual({ value: 10, index: 1, dataPointText: '10' });
  });

  it('keeps short arrays intact', () => {
    expect(prepareChartData([1.4, 2.6])).toEqual([
      { value: 1.4, index: 0, dataPointText: '1' },
      { value: 2.6, index: 1, dataPointText: '3' },
    ]);
  });
});

describe('averageOf', () => {
  it('averages a plain array', () => {
    expect(averageOf([10, 20, 30])).toBe(20);
  });

  it('excludes zeros when asked (cadence coasting)', () => {
    expect(averageOf([0, 0, 80, 90], true)).toBe(85);
  });

  it('returns 0 for an empty/all-zero array', () => {
    expect(averageOf([], true)).toBe(0);
    expect(averageOf([0, 0], true)).toBe(0);
  });
});

describe('rideQualityBand / rideQualityFor / rideQualityColor', () => {
  it('maps each band at its inclusive upper bound', () => {
    expect(rideQualityBand(20)).toBe('poor');
    expect(rideQualityBand(35)).toBe('belowAvg');
    expect(rideQualityBand(50)).toBe('average');
    expect(rideQualityBand(65)).toBe('good');
    expect(rideQualityBand(75)).toBe('wellDone');
    expect(rideQualityBand(85)).toBe('excellent');
    expect(rideQualityBand(86)).toBe('awesome');
    expect(rideQualityBand(100)).toBe('awesome');
    // Out of range still resolves to the top band.
    expect(rideQualityBand(140)).toBe('awesome');
  });

  it('resolves label and advice from the given copy', () => {
    expect(rideQualityFor(10, copy)).toEqual({ quality: 10, band: 'poor', label: 'Poor', advice: 'Sleep more.' });
    expect(rideQualityFor(70, copy).label).toBe('Well done');
    expect(rideQualityFor(95, copy).advice).toBe('Machine mode!');
  });

  it('defaults to the English copy', () => {
    expect(rideQualityFor(60).label).toBe(RIDE_QUALITY_COPY_EN.good.label);
  });

  it('returns the band color (poor and awesome share one)', () => {
    expect(rideQualityColor(20)).toBe(RIDE_QUALITY_COLORS.poor);
    expect(rideQualityColor(90)).toBe(RIDE_QUALITY_COLORS.awesome);
    expect(rideQualityColor(90)).toBe(RIDE_QUALITY_COLORS.poor);
    expect(rideQualityColor(60)).toBe(RIDE_QUALITY_COLORS.good);
  });
});

describe('computeRideAnalysis', () => {
  it('returns empty results without heartrate/time streams', () => {
    expect(computeRideAnalysis(null, null, baseActivity(), copy)).toEqual({
      hrZoneDistribution: [],
      rideQuality: null,
    });
    expect(computeRideAnalysis({ heartrate: { data: [120] } }, null, baseActivity(), copy).rideQuality).toBeNull();
  });

  it('bails out when HR reserve is non-positive', () => {
    const streams = { heartrate: { data: [100, 110] }, time: { data: [0, 1] } };
    const result = computeRideAnalysis(streams, { max_hr: 60, resting_hr: 60 }, baseActivity(), copy);
    expect(result.hrZoneDistribution).toEqual([]);
    expect(result.rideQuality).toBeNull();
  });

  it('bails out when no sample lands in any zone', () => {
    // Karvonen zones from 190/60 start at 125 bpm — every sample is below Z1.
    const streams = { heartrate: { data: [90, 95, 100] }, time: { data: [0, 1, 2] } };
    const result = computeRideAnalysis(streams, { max_hr: 190, resting_hr: 60 }, baseActivity(), copy);
    expect(result.rideQuality).toBeNull();
  });

  it('buckets time into the five zones and grades the ride', () => {
    // 10 minutes at 1 s samples, HR sweeping 130-189 -> spread across Z1-Z5.
    const n = 600;
    const heartrate = Array.from({ length: n }, (_, i) => 130 + (i % 60));
    const time = Array.from({ length: n }, (_, i) => i);
    const cadence = Array.from({ length: n }, () => 85);
    const streams = { heartrate: { data: heartrate }, time: { data: time }, cadence: { data: cadence } };

    const result = computeRideAnalysis(streams, { max_hr: 190, resting_hr: 60 }, baseActivity(), copy);

    expect(result.hrZoneDistribution).toHaveLength(5);
    expect(result.hrZoneDistribution[0]).toMatchObject({ zone: 'Z1', rangeMin: 125, rangeMax: 138 });
    // Karvonen Z5 is open-ended: its ceiling is the max HR.
    expect(result.hrZoneDistribution[4]).toMatchObject({ zone: 'Z5', rangeMax: 190 });
    const totalPercent = result.hrZoneDistribution.reduce((s, z) => s + z.percent, 0);
    expect(totalPercent).toBeGreaterThanOrEqual(98);
    expect(totalPercent).toBeLessThanOrEqual(102);
    // Per-zone rounding can lose a minute against the 10 ridden.
    const totalMinutes = result.hrZoneDistribution.reduce((s, z) => s + z.minutes, 0);
    expect(totalMinutes).toBeGreaterThanOrEqual(9);
    expect(totalMinutes).toBeLessThanOrEqual(10);

    expect(result.rideQuality).not.toBeNull();
    expect(result.rideQuality?.quality).toBeGreaterThanOrEqual(0);
    expect(result.rideQuality?.quality).toBeLessThanOrEqual(100);
    expect(result.rideQuality?.label).toBe(copy[result.rideQuality!.band].label);
  });

  it('computes the documented score for a steady Z2 ride', () => {
    // Steady 135 bpm (Z2 for 190/60 Karvonen: 138-151? no: Z1 125-138, Z2 138-151),
    // so use 145 bpm. Avg speed 8 m/s = 28.8 km/h, max 12 m/s = 43.2 km/h,
    // cadence 87.5 (perfect), flat-ish 100 m over 30 km.
    const n = 601;
    const streams = {
      heartrate: { data: Array.from({ length: n }, () => 145) },
      time: { data: Array.from({ length: n }, (_, i) => i) },
      cadence: { data: Array.from({ length: n }, () => 87.5) },
    };
    const result = computeRideAnalysis(streams, { max_hr: 190, resting_hr: 60 }, baseActivity(), copy);

    // intensity = (145-60)/130 = 0.6538; cardiac = min(100, 28.8/(0.6538*50)*80) = 70.47
    // cadence = 100; speed = 28.8/35*100 + 43.2/55*20 = 82.29 + 15.71 = 98.0
    // zone efficiency: 100% in Z2 -> min(100, 120) = 100
    // elevation multiplier: 1 + (100/30)*0.02 = 1.0667
    // raw = (70.47*0.4 + 100*0.25 + 98*0.2 + 100*0.15) * 1.0667 = (28.19+25+19.6+15)*1.0667 = 93.6
    expect(result.rideQuality?.quality).toBe(94);
    expect(result.rideQuality?.band).toBe('awesome');
    expect(result.hrZoneDistribution.find((z) => z.zone === 'Z2')?.percent).toBe(100);
  });

  it('falls back to the ride max HR and default resting HR without a profile, and to neutral cadence', () => {
    const n = 121;
    const streams = {
      heartrate: { data: Array.from({ length: n }, () => 150) },
      time: { data: Array.from({ length: n }, (_, i) => i) },
    };
    // No profile: zones are %-of-max from the ride's 180 bpm (no resting HR
    // -> no Karvonen), i.e. 90/108/126/144/162; the 60 bpm default resting
    // HR only feeds the intensity term.
    const result = computeRideAnalysis(streams, null, baseActivity({ average_speed: null, max_speed: null }), copy);
    expect(result.hrZoneDistribution[0].rangeMin).toBe(90);
    expect(result.hrZoneDistribution[4].rangeMax).toBe(180);
    // Zero speed -> cardiac 0, speed 0; cadence neutral 50; 150 bpm is Z4 -> zone 0.
    // raw = (0 + 12.5 + 0 + 0) * 1.0667 = 13.3
    expect(result.rideQuality?.quality).toBe(13);
    expect(result.rideQuality?.band).toBe('poor');
  });

  it('uses 190 bpm when neither profile nor ride has a max HR, and clamps the elevation multiplier', () => {
    const n = 61;
    const streams = {
      heartrate: { data: Array.from({ length: n }, () => 150) },
      time: { data: Array.from({ length: n }, (_, i) => i) },
    };
    // 2000 m over 10 km -> gradient 200 m/km -> multiplier clamped at 1.4.
    const activity = baseActivity({ max_heartrate: undefined, distance: 10000, total_elevation_gain: 2000 });
    const result = computeRideAnalysis(streams, {}, activity, copy);
    expect(result.hrZoneDistribution[4].rangeMax).toBe(190);
    expect(result.rideQuality).not.toBeNull();
  });

  it('treats a zero-distance ride as flat', () => {
    const streams = { heartrate: { data: [150, 150] }, time: { data: [0, 1] } };
    const result = computeRideAnalysis(streams, { max_hr: 190, resting_hr: 60 }, baseActivity({ distance: 0 }), copy);
    expect(result.rideQuality).not.toBeNull();
  });
});

describe('rideCoachPrompt', () => {
  it('names the ride, date, distance, elevation and whole minutes', () => {
    const prompt = rideCoachPrompt(
      { name: 'Morning Ride', distance: 42345, total_elevation_gain: 512.6, moving_time: 5430 },
      '08.01.2024',
    );
    expect(prompt).toBe('Analyse my ride "Morning Ride" from 08.01.2024: 42.3km, 513m elevation, 90 min');
  });
});
