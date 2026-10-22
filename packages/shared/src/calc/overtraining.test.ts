import { describe, expect, it } from 'vitest';
import {
  buildTrendChartPaths,
  computeOvertrainingRate,
  getOvertrainingRiskLevel,
  selectTrendSeries,
  smoothPath,
  type TrendActivity,
} from './overtraining.js';

function ride(day: number, hr: number | null, speedMs: number | null, type = 'Ride'): TrendActivity {
  return {
    type,
    start_date: `2026-09-${String(day).padStart(2, '0')}T08:00:00Z`,
    average_heartrate: hr,
    average_speed: speedMs,
  };
}

describe('selectTrendSeries', () => {
  it('keeps Ride/VirtualRide with HR and speed, oldest first, speed in km/h to 1 decimal', () => {
    const series = selectTrendSeries([
      ride(3, 150, 8.0),
      ride(1, 140, 7.5, 'VirtualRide'),
      ride(2, 145, 7.0, 'Run'),
      ride(4, null, 8.2),
      ride(5, 152, null),
      ride(6, 155, 0),
    ]);
    expect(series).toEqual({ hr: [140, 150], speedKmh: [27, 28.8] });
  });

  it('plots only the newest 20 rides (sliced before the HR/speed filter, like the chart always did)', () => {
    const activities = Array.from({ length: 25 }, (_, i) => ride(i + 1, 120 + i, 7));
    const series = selectTrendSeries(activities);
    expect(series.hr).toHaveLength(20);
    expect(series.hr[0]).toBe(125);
    expect(series.hr[19]).toBe(144);
  });

  it('is empty for no activities or an untyped activity', () => {
    expect(selectTrendSeries(undefined)).toEqual({ hr: [], speedKmh: [] });
    expect(selectTrendSeries(null)).toEqual({ hr: [], speedKmh: [] });
    expect(selectTrendSeries([{ start_date: '2026-09-01', average_heartrate: 140, average_speed: 8 }])).toEqual({
      hr: [],
      speedKmh: [],
    });
  });
});

describe('computeOvertrainingRate', () => {
  it('needs at least 4 paired rides', () => {
    expect(computeOvertrainingRate([140, 142, 144], [28, 28, 28])).toBeNull();
    expect(computeOvertrainingRate([140, 142, 144, 146], [28, 28, 28])).toBeNull();
  });

  it('reads a rising HR with falling speed as fatigue, scaled to RATE_MAX_DIVERGENCE', () => {
    // HR 140 → 147 = +5 %, speed 30 → 28.5 = −5 %: divergence 0.10 → 67 %.
    const result = computeOvertrainingRate([140, 140, 147, 147], [30, 30, 28.5, 28.5]);
    expect(result).toEqual({ rate: 67, fatigueDetected: true });
  });

  it('floors at 0 when HR and speed move together or the rider is recovering', () => {
    expect(computeOvertrainingRate([150, 150, 140, 140], [28, 28, 30, 30])).toEqual({
      rate: 0,
      fatigueDetected: false,
    });
  });

  it('caps at 100 for an extreme divergence', () => {
    expect(computeOvertrainingRate([140, 140, 180, 180], [30, 30, 20, 20])).toEqual({
      rate: 100,
      fatigueDetected: true,
    });
  });

  it('does not flag fatigue for a small divergence under the threshold', () => {
    // HR +3 %, speed flat: divergence 0.03 < 0.04 → 20 %, no flag.
    expect(computeOvertrainingRate([100, 100, 103, 103], [30, 30, 30, 30])).toEqual({
      rate: 20,
      fatigueDetected: false,
    });
  });

  it('only looks at the most recent 8 rides', () => {
    const olderSpike = [200, 200, 200, 200];
    const recentFlat = [140, 140, 140, 140, 140, 140, 140, 140];
    const speed = Array(12).fill(30);
    expect(computeOvertrainingRate([...olderSpike, ...recentFlat], speed)).toEqual({
      rate: 0,
      fatigueDetected: false,
    });
  });

  it('treats a zero first-half average as no change instead of dividing by zero', () => {
    expect(computeOvertrainingRate([0, 0, 10, 10], [0, 0, 10, 10])).toEqual({ rate: 0, fatigueDetected: false });
  });
});

describe('getOvertrainingRiskLevel', () => {
  it('buckets the 0–100 rate with inclusive lower bounds', () => {
    expect(getOvertrainingRiskLevel(0)).toBe('low');
    expect(getOvertrainingRiskLevel(24)).toBe('low');
    expect(getOvertrainingRiskLevel(25)).toBe('moderate');
    expect(getOvertrainingRiskLevel(50)).toBe('elevated');
    expect(getOvertrainingRiskLevel(75)).toBe('high');
    expect(getOvertrainingRiskLevel(100)).toBe('high');
  });

  it('falls back to low for a rate below the table', () => {
    expect(getOvertrainingRiskLevel(-5)).toBe('low');
  });
});

describe('smoothPath', () => {
  it('is empty for fewer than 2 points', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 0, y: 0 }])).toBe('');
  });

  it('draws a Catmull-Rom cubic between each pair, clamping the end tangents', () => {
    const d = smoothPath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ]);
    // Segment 1: p0 = p1 = (0,10), p2 = (10,0), p3 = (20,10).
    // c1 = (0 + 10/6, 10 − 10/6), c2 = (10 − 20/6, 0 − 0/6).
    // Segment 2: p0 = (0,10), p1 = (10,0), p2 = p3 = (20,10).
    // c1 = (10 + 20/6, 0 + 0/6), c2 = (20 − 10/6, 10 − 10/6).
    expect(d).toBe(
      `M 0 10 C ${10 / 6} ${10 - 10 / 6}, ${10 - 20 / 6} 0, 10 0` +
        ` C ${10 + 20 / 6} 0, ${20 - 10 / 6} ${10 - 10 / 6}, 20 10`
    );
  });
});

describe('buildTrendChartPaths', () => {
  const box = { width: 100, top: 0, bottom: 100 };

  it('needs at least 2 rides', () => {
    expect(buildTrendChartPaths({ hr: [140], speedKmh: [28] }, box)).toBeNull();
  });

  it('normalises HR and ×5 speed against one shared max with 10 % headroom', () => {
    const paths = buildTrendChartPaths({ hr: [110, 110], speedKmh: [20, 20] }, box);
    // Shared max = max(110, 20 × 5) × 1.1; y = bottom − v / max × height.
    const max = Math.max(110, 100) * 1.1;
    const hrY = 100 - (110 / max) * 100;
    const spY = 100 - (100 / max) * 100;
    expect(paths).toEqual({
      hrLine: `M 0 ${hrY} C ${100 / 6} ${hrY}, ${100 - 100 / 6} ${hrY}, 100 ${hrY}`,
      speedLine: `M 0 ${spY} C ${100 / 6} ${spY}, ${100 - 100 / 6} ${spY}, 100 ${spY}`,
      hrArea: `M 0 ${hrY} C ${100 / 6} ${hrY}, ${100 - 100 / 6} ${hrY}, 100 ${hrY} L 100 100 L 0 100 Z`,
    });
  });

  it('uses only as many speed points as there are HR points', () => {
    const paths = buildTrendChartPaths({ hr: [100, 100], speedKmh: [10, 10, 999] }, box);
    expect(paths?.speedLine.split(' C ')).toHaveLength(2);
  });
});
