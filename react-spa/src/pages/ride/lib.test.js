import { describe, it, expect } from 'vitest';
import polyline from '@mapbox/polyline';
import { trackToSvgPath, decodeTrack, formatElapsed, streamToSeries, rideMetrics, coachUrlForRide } from './lib';

describe('trackToSvgPath', () => {
  it('returns an empty path for fewer than two points', () => {
    expect(trackToSvgPath(null, 100, 100)).toBe('');
    expect(trackToSvgPath([[46, 10]], 100, 100)).toBe('');
  });

  it('scales a diagonal track into the padded box, north up', () => {
    // Two points on the equator-ish (cos ≈ 1): SW corner to NE corner.
    const path = trackToSvgPath(
      [
        [0, 0],
        [1, 1],
      ],
      100,
      100,
      10,
    );
    // First point is the south-west corner -> bottom-left of the box.
    expect(path.startsWith('M10.0 90.0')).toBe(true);
    expect(path.endsWith('L90.0 10.0')).toBe(true);
  });

  it('keeps a flat east-west track finite and centred vertically', () => {
    const path = trackToSvgPath(
      [
        [0, 0],
        [0, 1],
      ],
      100,
      50,
      0,
    );
    expect(path).toBe('M0.0 25.0 L100.0 25.0');
  });
});

describe('decodeTrack', () => {
  it('decodes an encoded polyline and returns null when absent', () => {
    const encoded = polyline.encode([
      [46.5, 10.2],
      [46.6, 10.3],
    ]);
    expect(decodeTrack(encoded)).toHaveLength(2);
    expect(decodeTrack(null)).toBeNull();
    expect(decodeTrack('')).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(3725.4)).toBe('1:02:05');
  });
});

describe('streamToSeries', () => {
  it('pairs values with elapsed-time labels and converts units', () => {
    expect(streamToSeries([5, 10], [0, 60], (v) => v * 3.6)).toEqual([
      { x: '0:00', y: 18 },
      { x: '1:00', y: 36 },
    ]);
  });

  it('falls back to the sample index without a time stream', () => {
    expect(streamToSeries([140, 150], null)).toEqual([
      { x: '0', y: 140 },
      { x: '1', y: 150 },
    ]);
    expect(streamToSeries([], [])).toEqual([]);
  });
});

describe('rideMetrics', () => {
  it('formats every present metric and drops missing ones', () => {
    const rows = rideMetrics({
      distance: 42345,
      moving_time: 5430,
      average_speed: 8.33,
      total_elevation_gain: 512.6,
      average_heartrate: 145.4,
      average_cadence: null,
      estimated_power: { avgWatts: 180.2 },
      average_temp: 21.6,
    });
    expect(rows).toEqual([
      { label: 'Distance', value: '42.3 km' },
      { label: 'Moving time', value: '91 min' },
      { label: 'Avg speed', value: '30.0 km/h' },
      { label: 'Elevation gain', value: '513 m' },
      { label: 'Avg heart rate', value: '145 bpm' },
      { label: 'Est. power', value: '180 W' },
      { label: 'Temperature', value: '22 °C' },
    ]);
    expect(rideMetrics(null)).toEqual([]);
  });
});

describe('coachUrlForRide', () => {
  it('encodes the prompt and carries the activity id separately', () => {
    const url = coachUrlForRide('Analyse my ride "Morning Ride" from 08.01.2024: 42.3km', 123);
    expect(url.startsWith('/coach?prompt=')).toBe(true);
    const params = new URLSearchParams(url.slice('/coach?'.length));
    expect(params.get('prompt')).toBe('Analyse my ride "Morning Ride" from 08.01.2024: 42.3km');
    expect(params.get('activity')).toBe('123');
  });
});
