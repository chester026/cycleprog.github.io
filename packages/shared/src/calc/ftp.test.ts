import { describe, expect, it } from 'vitest';
import { analyzeHighIntensityTime, getFTPLevel } from './ftp.js';

function buildHr(spec: Array<[number, number]>): number[] {
  // spec: list of [bpm, sampleCount] run-length pairs -> flat array.
  const hr: number[] = [];
  for (const [bpm, count] of spec) {
    for (let i = 0; i < count; i += 1) hr.push(bpm);
  }
  return hr;
}

describe('analyzeHighIntensityTime', () => {
  it('finds a single interval at/above the default 160bpm threshold lasting >=120s (1Hz, no time stream)', () => {
    const hr = buildHr([
      [140, 60], // 60s warmup, below threshold
      [165, 150], // 150s interval, above threshold
      [130, 60], // cooldown
    ]);
    const result = analyzeHighIntensityTime({ heartrate: hr });
    expect(result.totalIntervals).toBe(1);
    expect(result.intervals[0]).toMatchObject({ startSec: 60, durationSec: 150, avgHr: 165 });
    expect(result.totalMinutes).toBe(3); // round(150/60) = 3 (rounds 2.5 up)
  });

  it('discards a run shorter than minIntervalSec', () => {
    const hr = buildHr([
      [140, 30],
      [165, 90], // only 90s, below the 120s default
      [130, 30],
    ]);
    const result = analyzeHighIntensityTime({ heartrate: hr });
    expect(result.totalIntervals).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  it('counts an interval that runs to the very end of the stream', () => {
    const hr = buildHr([
      [140, 30],
      [170, 130],
    ]);
    const result = analyzeHighIntensityTime({ heartrate: hr });
    expect(result.totalIntervals).toBe(1);
    expect(result.intervals[0].durationSec).toBe(130);
  });

  it('finds multiple separate intervals and sums their minutes', () => {
    const hr = buildHr([
      [140, 30],
      [165, 120],
      [140, 30],
      [170, 180],
      [130, 30],
    ]);
    const result = analyzeHighIntensityTime({ heartrate: hr });
    expect(result.totalIntervals).toBe(2);
    expect(result.totalMinutes).toBe(Math.round((120 + 180) / 60));
  });

  it('respects a custom hrThreshold and minIntervalSec', () => {
    const hr = buildHr([
      [150, 60],
      [130, 60],
    ]);
    const belowCustomThreshold = analyzeHighIntensityTime({ heartrate: hr }, { hrThreshold: 155 });
    expect(belowCustomThreshold.totalIntervals).toBe(0);

    const meetsCustomThreshold = analyzeHighIntensityTime({ heartrate: hr }, { hrThreshold: 145, minIntervalSec: 30 });
    expect(meetsCustomThreshold.totalIntervals).toBe(1);
    expect(meetsCustomThreshold.intervals[0].durationSec).toBe(60);
  });

  it('uses the time stream (not sample count) for duration when samples are not 1Hz', () => {
    // 5 samples spaced 60s apart -> a 3-sample run (indices 1-3) spans 180s
    // of elapsed time, not 3 (sample-count) seconds.
    const result = analyzeHighIntensityTime(
      { heartrate: [140, 165, 168, 170, 130], time: [0, 60, 120, 180, 240] },
      { minIntervalSec: 120 },
    );
    expect(result.totalIntervals).toBe(1);
    expect(result.intervals[0]).toMatchObject({ startSec: 60, durationSec: 180 });
  });

  it('returns no intervals for an empty or missing heartrate stream', () => {
    expect(analyzeHighIntensityTime({}).totalIntervals).toBe(0);
    expect(analyzeHighIntensityTime({ heartrate: [] }).totalIntervals).toBe(0);
  });

  it('treats a falsy (0/undefined) sample as 0bpm both for the threshold check and the interval average', () => {
    // hrThreshold: 0 makes every (falsy) 0bpm sample count as "at/above
    // threshold" -> exercises the `hr[i] || 0` fallback in the outer scan
    // and the `hr[j] || 0` fallback in the average-HR sum, which a normal
    // (>0) threshold can never reach (a falsy sample is always < a
    // positive threshold, so it would never join a contiguous run).
    const result = analyzeHighIntensityTime(
      { heartrate: [0, 0, undefined as unknown as number, 0] },
      { hrThreshold: 0, minIntervalSec: 0 },
    );
    expect(result.totalIntervals).toBe(1);
    expect(result.intervals[0]).toMatchObject({ startSec: 0, durationSec: 4, avgHr: 0 });
  });
});

describe('getFTPLevel', () => {
  it.each([
    [0, 'Low'],
    [29, 'Low'],
    [30, 'Normal'],
    [59, 'Normal'],
    [60, 'Keep going!'],
    [119, 'Keep going!'],
    [120, 'Overwhelmed'],
    [179, 'Overwhelmed'],
    [180, 'Outstanding'],
    [400, 'Outstanding'],
  ])('classifies %i minutes as %s', (minutes, level) => {
    expect(getFTPLevel(minutes).level).toBe(level);
  });

  it('always includes a color and description', () => {
    const result = getFTPLevel(45);
    expect(result.color).toMatch(/^#/);
    expect(result.description).toBeTruthy();
  });
});
