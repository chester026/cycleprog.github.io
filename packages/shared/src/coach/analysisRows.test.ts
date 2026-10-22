import { describe, expect, it } from 'vitest';
import type { ActivityAnalysisResult } from '../types/coachUi.js';
import { buildBaselineRows, buildSimilarRideRows, buildSkillChanges } from './analysisRows.js';

const t = (key: string) => key;

const analysis: ActivityAnalysisResult = {
  activity: {
    distance_km: 42.1,
    avg_speed_kmh: 29.5,
    avg_hr_bpm: 151,
    avg_watts: 205,
    avg_cadence_rpm: 88,
    effort_score: 61,
  },
  vs_baseline: {
    speed_kmh: { ride: 29.5, avg: 27.8, diff: 1.7 },
    hr_bpm: { ride: 151, avg: 148, diff: 3 },
    power_watts: { ride: 205, avg: 198, diff: 7 },
    cadence_rpm: { ride: 88, avg: 90, diff: -2 },
    unknown_metric: { ride: 1, avg: 1, diff: 0 },
  },
  similar_ride: {
    name: 'Sunday Climb',
    date: '2026-09-07T08:00:00Z',
    distance_km: 40.2,
    avg_speed_kmh: 28.1,
    avg_hr_bpm: 149,
    avg_watts: 199,
    avg_cadence_rpm: 86,
  },
  skills_delta: {
    climbing: { previous: 60, current: 63, diff: 3 },
    consistency: { previous: 70, current: 68, diff: -2 },
    mystery: { previous: 1, current: 2, diff: 1 },
  },
};

describe('buildBaselineRows', () => {
  it('builds one row per known metric; higher is better except HR', () => {
    expect(buildBaselineRows(analysis, t)).toEqual([
      { label: 'common.avgSpeed', oldValue: '27.8 common.kmh', newValue: '29.5 common.kmh', isPositive: true },
      { label: 'common.heartRate', oldValue: '148 common.bpm', newValue: '151 common.bpm', isPositive: false },
      { label: 'common.power', oldValue: '198 common.watts', newValue: '205 common.watts', isPositive: true },
      { label: 'common.cadence', oldValue: '90 common.rpm', newValue: '88 common.rpm', isPositive: false },
    ]);
  });

  it('is empty without vs_baseline', () => {
    expect(buildBaselineRows({ activity: {} }, t)).toEqual([]);
  });
});

describe('buildSimilarRideRows', () => {
  it('always compares distance, then only the metrics both rides have', () => {
    expect(buildSimilarRideRows(analysis, t)).toEqual([
      { label: 'common.distance', oldValue: '40.2 common.km', newValue: '42.1 common.km' },
      { label: 'common.avgSpeed', oldValue: '28.1 common.kmh', newValue: '29.5 common.kmh', isPositive: true },
      { label: 'common.heartRate', oldValue: '149 common.bpm', newValue: '151 common.bpm' },
      { label: 'common.power', oldValue: '199 common.watts', newValue: '205 common.watts', isPositive: true },
      { label: 'common.cadence', oldValue: '86 common.rpm', newValue: '88 common.rpm' },
    ]);
  });

  it('drops a metric either ride lacks', () => {
    const rows = buildSimilarRideRows(
      {
        activity: { distance_km: 10, avg_speed_kmh: 25, avg_hr_bpm: null, avg_watts: 200, avg_cadence_rpm: null },
        similar_ride: { name: 'x', date: 'd', distance_km: 9, avg_speed_kmh: 24, avg_hr_bpm: 140, avg_watts: null },
      },
      t
    );
    expect(rows.map((r) => r.label)).toEqual(['common.distance', 'common.avgSpeed']);
    expect(rows[1].isPositive).toBe(true);
    expect(
      buildSimilarRideRows(
        { activity: { distance_km: 10 }, similar_ride: { name: 'x', date: 'd', distance_km: 9, avg_speed_kmh: 24 } },
        t
      ).map((r) => r.label)
    ).toEqual(['common.distance']);
  });

  it('marks a slower/weaker ride as not positive', () => {
    const rows = buildSimilarRideRows(
      {
        activity: { distance_km: 10, avg_speed_kmh: 24, avg_watts: 190 },
        similar_ride: { name: 'x', date: 'd', distance_km: 9, avg_speed_kmh: 25, avg_watts: 200 },
      },
      t
    );
    expect(rows.map((r) => r.isPositive)).toEqual([undefined, false, false]);
  });

  it('is empty without a similar ride', () => {
    expect(buildSimilarRideRows({ activity: { distance_km: 10 } }, t)).toEqual([]);
    expect(buildSimilarRideRows({ activity: { distance_km: 10 }, similar_ride: null }, t)).toEqual([]);
  });
});

describe('buildSkillChanges', () => {
  it('translates known skills (consistency → discipline) and passes an unknown key through', () => {
    expect(buildSkillChanges(analysis, t)).toEqual([
      { name: 'skills.climbing', previous: 60, current: 63, diff: 3 },
      { name: 'skills.discipline', previous: 70, current: 68, diff: -2 },
      { name: 'mystery', previous: 1, current: 2, diff: 1 },
    ]);
  });

  it('is empty without skills_delta', () => {
    expect(buildSkillChanges({ activity: {} }, t)).toEqual([]);
  });
});
