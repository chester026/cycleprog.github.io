import {
  formatRideDate,
  prepareChartData,
  averageOf,
  computeRideAnalysis,
  rideQualityFor,
  rideQualityColor,
} from './lib';
import type {Activity} from '../../types/activity';
import type {RideQualityCopy} from './lib';
import {colors} from '../../theme';

const copy: RideQualityCopy = {
  poor: {label: 'Poor', advice: 'Sleep more.'},
  belowAvg: {label: 'Below Avg', advice: 'Recover.'},
  average: {label: 'Average', advice: 'Check pacing.'},
  good: {label: 'Good', advice: 'Solid effort.'},
  wellDone: {label: 'Well done', advice: 'Keep pushing!'},
  excellent: {label: 'Excellent', advice: 'In form!'},
  awesome: {label: 'Awesome!', advice: 'Machine mode!'},
};

describe('formatRideDate', () => {
  it('formats as dd.mm.yyyy', () => {
    expect(formatRideDate('2024-03-05T08:00:00Z')).toMatch(/^\d{2}\.\d{2}\.2024$/);
  });
});

describe('prepareChartData', () => {
  it('returns an empty array for no data', () => {
    expect(prepareChartData([])).toEqual([]);
  });

  it('downsamples to at most 40 points and keeps value/index/text', () => {
    const data = Array.from({length: 400}, (_, i) => i);
    const result = prepareChartData(data);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result[0]).toEqual({value: 0, index: 0, dataPointText: '0'});
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

describe('rideQualityFor', () => {
  it('maps each band correctly', () => {
    expect(rideQualityFor(10, copy).label).toBe('Poor');
    expect(rideQualityFor(30, copy).label).toBe('Below Avg');
    expect(rideQualityFor(45, copy).label).toBe('Average');
    expect(rideQualityFor(60, copy).label).toBe('Good');
    expect(rideQualityFor(70, copy).label).toBe('Well done');
    expect(rideQualityFor(80, copy).label).toBe('Excellent');
    expect(rideQualityFor(95, copy).label).toBe('Awesome!');
  });
});

describe('rideQualityColor', () => {
  it('returns the poor color at the boundary and the top color above 85', () => {
    expect(rideQualityColor(20)).toBe(colors.rideQuality.poor);
    expect(rideQualityColor(90)).toBe(colors.rideQuality.poor);
    expect(rideQualityColor(60)).toBe(colors.rideQuality.good);
  });
});

const baseActivity = (overrides: Partial<Activity> = {}): Activity =>
  ({
    id: 1,
    name: 'Ride',
    distance: 30000,
    moving_time: 3600,
    elapsed_time: 3600,
    total_elevation_gain: 100,
    average_speed: 8,
    max_speed: 12,
    max_heartrate: 180,
    start_date: '2024-01-08T08:00:00Z',
    type: 'Ride',
    ...overrides,
  } as unknown as Activity);

describe('computeRideAnalysis', () => {
  it('returns empty results without heartrate/time streams', () => {
    const result = computeRideAnalysis(null, null, baseActivity(), copy);
    expect(result.hrZoneDistribution).toEqual([]);
    expect(result.rideQuality).toBeNull();
  });

  it('computes an HR-zone distribution and a 0-100 ride quality from streams', () => {
    const n = 600; // 10 minutes @ 1s samples
    const heartrate = Array.from({length: n}, (_, i) => 120 + (i % 60));
    const time = Array.from({length: n}, (_, i) => i);
    const cadence = Array.from({length: n}, () => 85);
    const streams = {heartrate: {data: heartrate}, time: {data: time}, cadence: {data: cadence}};

    const result = computeRideAnalysis(streams, {max_hr: 190, resting_hr: 60}, baseActivity(), copy);

    expect(result.hrZoneDistribution).toHaveLength(5);
    const totalPercent = result.hrZoneDistribution.reduce((s, z) => s + z.percent, 0);
    expect(totalPercent).toBeGreaterThan(90); // rounding, should sum near 100
    expect(result.rideQuality?.quality).toBeGreaterThanOrEqual(0);
    expect(result.rideQuality?.quality).toBeLessThanOrEqual(100);
    expect(result.rideQuality?.label).toBeTruthy();
  });

  it('bails out when HR reserve is non-positive', () => {
    const streams = {heartrate: {data: [100, 110]}, time: {data: [0, 1]}};
    const result = computeRideAnalysis(
      streams,
      {max_hr: 60, resting_hr: 60},
      baseActivity(),
      copy,
    );
    expect(result.hrZoneDistribution).toEqual([]);
    expect(result.rideQuality).toBeNull();
  });
});
