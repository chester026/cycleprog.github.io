import { describe, expect, it } from 'vitest';
import { mapPowerProfile, mapRidePower } from './powerCards.js';
import type { ToolCall } from '../types/coachUi.js';

const call = (name: string, result: unknown, status: ToolCall['status'] = 'done'): ToolCall =>
  ({ id: name, name, status, result } as unknown as ToolCall);

// Fixture copied from services/powerProfile.js's getPowerProfile return.
const profileResult = {
  weeks: 12,
  ridesWithPower: 14,
  ridesAnalyzed: 14,
  bestEfforts: {
    5: { watts: 812, activityId: 1, date: '2026-10-01' },
    60: { watts: 455, activityId: 2, date: '2026-09-20' },
    300: { watts: 318, activityId: 3, date: '2026-10-14' },
    1200: { watts: 262, activityId: 3, date: '2026-10-14' },
  },
  ftp: { watts: 249, method: 'ftp20', fromActivityId: 3, date: '2026-10-14' },
  wPerKg: 3.56,
  zones: [],
  note: null,
};

describe('mapPowerProfile', () => {
  it('maps the profile into ordered efforts with FTP and W/kg', () => {
    const m = mapPowerProfile([call('get_power_profile', profileResult)]);
    expect(m).toEqual({
      weeks: 12,
      ftpWatts: 249,
      ftpMethod: 'ftp20',
      ftpDate: '2026-10-14',
      ftpEstimatedWatts: null,
      wPerKg: 3.56,
      ridesWithPower: 14,
      efforts: [
        { seconds: 5, watts: 812, date: '2026-10-01' },
        { seconds: 60, watts: 455, date: '2026-09-20' },
        { seconds: 300, watts: 318, date: '2026-10-14' },
        { seconds: 1200, watts: 262, date: '2026-10-14' },
      ],
    });
  });

  it('is null without efforts, for a running/failed call, or a non-object result; tolerates a missing ftp', () => {
    expect(mapPowerProfile(undefined)).toBeNull();
    expect(mapPowerProfile([call('get_power_profile', { ...profileResult, bestEfforts: {} })])).toBeNull();
    expect(mapPowerProfile([call('get_power_profile', profileResult, 'running')])).toBeNull();
    expect(mapPowerProfile([call('get_power_profile', 'oops')])).toBeNull();
    expect(mapPowerProfile([call('get_power_profile', { bestEfforts: 'nope' })])).toBeNull();
    const noFtp = mapPowerProfile([call('get_power_profile', { bestEfforts: { 5: { watts: 500 } }, ftp: null, wPerKg: null })]);
    expect(noFtp).toMatchObject({ weeks: 12, ftpWatts: null, ftpMethod: null, ftpDate: null, ftpEstimatedWatts: null, wPerKg: null, ridesWithPower: 0 });
    const manual = mapPowerProfile([call('get_power_profile', { bestEfforts: { 5: { watts: 500 } }, ftp: { watts: 177, method: 'manual', date: '2026-11-06', estimated: { watts: 160, method: 'ftp20' } } })]);
    expect(manual).toMatchObject({ ftpWatts: 177, ftpMethod: 'manual', ftpDate: '2026-11-06', ftpEstimatedWatts: 160 });
    expect(noFtp?.efforts).toEqual([{ seconds: 5, watts: 500, date: undefined }]);
    const oddMethod = mapPowerProfile([call('get_power_profile', { bestEfforts: { 5: { watts: 500 } }, ftp: { watts: 200, method: 'guess' } })]);
    expect(oddMethod?.ftpMethod).toBeNull();
    expect(mapPowerProfile([call('get_power_profile', { bestEfforts: { 5: { watts: 500 } }, ftp: { watts: 163, method: 'cp' } })])?.ftpMethod).toBe('cp');
  });

  it('uses the latest completed call of the turn', () => {
    const m = mapPowerProfile([
      call('get_power_profile', profileResult),
      call('get_power_profile', { ...profileResult, weeks: 4 }),
    ]);
    expect(m?.weeks).toBe(4);
  });
});

// Fixture copied from services/rideAnalysis.js (ridePowerBreakdown + activity_id/ftp_w).
const rideResult = {
  activity_id: 77,
  ftp_w: 249,
  source: 'meter',
  duration_s: 5400,
  avg_w: 198,
  np_w: 221,
  max_w: 740,
  vi: 1.12,
  if_: 0.89,
  tss: 119,
  best_efforts_w: { 5: 740, 60: 430, 300: 300, 1200: 245 },
  zones_s: [100, 200, 300, 400, 500, 60, 10],
  segments: [
    { kind: 'flat', start_s: 0, duration_s: 1200, distance_m: 9000, grade_pct: 0.1, avg_w: 180, avg_hr: 140, avg_speed_kmh: 27, avg_cadence: 90 },
    { kind: 'climb', start_s: 1200, duration_s: 300, distance_m: 400, grade_pct: 7, avg_w: 320, avg_hr: 170, avg_speed_kmh: 10, avg_cadence: 70 },
    { kind: 'climb', start_s: 1500, duration_s: 900, distance_m: 3200, grade_pct: 6.1, avg_w: 280, avg_hr: 168, avg_speed_kmh: 12.8, avg_cadence: 75 },
    { kind: 'climb', start_s: 2400, duration_s: 600, distance_m: 2000, grade_pct: 5, avg_w: 265, avg_hr: null, avg_speed_kmh: 13, avg_cadence: null },
    { kind: 'climb', start_s: 3000, duration_s: 500, distance_m: 1500, grade_pct: 4, avg_w: 250, avg_hr: 160, avg_speed_kmh: 14, avg_cadence: 80 },
    { kind: 'climb', start_s: 3500, duration_s: 400, distance_m: 1000, grade_pct: 4, avg_w: 240, avg_hr: 158, avg_speed_kmh: 14, avg_cadence: 80 },
    'garbage',
  ],
  fade: { first_half_w: 210, second_half_w: 186, pct: -11.4 },
  coasting_pct: 9,
};

describe('mapRidePower', () => {
  it('maps the breakdown, keeping the three longest real climbs', () => {
    const m = mapRidePower([call('get_ride_power_breakdown', rideResult)]);
    expect(m).toMatchObject({ activityId: 77, npW: 221, avgW: 198, maxW: 740, intensityFactor: 0.89, tss: 119, vi: 1.12, ftpWatts: 249, fadePct: -11.4, coastingPct: 9 });
    expect(m?.efforts).toEqual([
      { seconds: 5, watts: 740 },
      { seconds: 60, watts: 430 },
      { seconds: 300, watts: 300 },
      { seconds: 1200, watts: 245 },
    ]);
    expect(m?.climbs.map((c) => c.distanceM)).toEqual([3200, 2000, 1500]);
    expect(m?.climbs[1]).toEqual({ distanceM: 2000, gradePct: 5, avgW: 265, avgHr: null, avgSpeedKmh: 13, durationS: 600, startS: 2400 });
  });

  it('is null for a ride without a meter, a missing result or missing core numbers; fills defaults for sparse payloads', () => {
    expect(mapRidePower(undefined)).toBeNull();
    expect(mapRidePower([call('get_ride_power_breakdown', { ...rideResult, source: 'none' })])).toBeNull();
    expect(mapRidePower([call('get_ride_power_breakdown', { ...rideResult, np_w: null })])).toBeNull();
    expect(mapRidePower([call('get_ride_power_breakdown', { ...rideResult, avg_w: null })])).toBeNull();
    const sparse = mapRidePower([call('get_ride_power_breakdown', { source: 'meter', np_w: 200, avg_w: 190 })]);
    expect(sparse).toEqual({
      activityId: 0, npW: 200, avgW: 190, maxW: 0, intensityFactor: null, tss: null, vi: 1, ftpWatts: null,
      efforts: [], climbs: [], fadePct: null, coastingPct: null,
    });
    expect(mapRidePower([call('get_ride_power_breakdown', { source: 'meter', np_w: 200, avg_w: 190, segments: 'nope' })])?.climbs).toEqual([]);
    const sparseClimb = mapRidePower([call('get_ride_power_breakdown', { source: 'meter', np_w: 200, avg_w: 190, segments: [{ kind: 'climb', distance_m: 800 }, { kind: 'climb' }] })]);
    expect(sparseClimb?.climbs).toEqual([{ distanceM: 800, gradePct: 0, avgW: null, avgHr: null, avgSpeedKmh: 0, durationS: 0, startS: 0 }]);
  });
});
