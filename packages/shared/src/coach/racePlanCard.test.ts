import { describe, expect, it } from 'vitest';
import { mapRacePlan } from './racePlanCard.js';
import type { ToolCall } from '../types/coachUi.js';

const call = (name: string, result: unknown, status: ToolCall['status'] = 'done'): ToolCall =>
  ({ id: name, name, status, result } as unknown as ToolCall);

// Shape of services/racePlans.js planRace.
const result = {
  course_id: 12,
  name: 'Lefkara Classic',
  distance_km: 74.5,
  elevation_gain_m: 1135,
  rider: { ftp_w: 183, weight_kg: 70, w_prime_kj: null },
  summary: {
    distance_m: 74500,
    gain_m: 1135,
    duration_s: 12024,
    avg_speed_kmh: 22.3,
    np_w: 152,
    if_: 0.83,
    tss: 231,
    carbs_g_per_h: 80,
    fluid_ml_per_h: 500,
    carbs_g: 216,
    fluid_ml: 1360,
    drafting: true,
    effort: 'race',
  },
  segments: [
    { index: 1, kind: 'flat', start_m: 0, distance_m: 8025, grade_pct: 0.3, low_w: 130, high_w: 145, pct_ftp: 76, duration_s: 1080, start_s: 0, eased: false },
    { index: 2, kind: 'climb', start_m: 8025, distance_m: 6100, grade_pct: 5.3, low_w: 165, high_w: 185, pct_ftp: 95, duration_s: 1680, start_s: 1080, eased: true },
    { index: 3, kind: 'tunnel', start_m: 14125, distance_m: 100 },
    null,
  ],
  fueling: [{ at_s: 1020, at_m: 7600, carbs_g: 27, fluid_ml: 170, moved: 'before_climb' }],
  profile: [[0, 100], [600, 102.5], 'x', [1200]],
  blocks: 16,
};

describe('mapRacePlan', () => {
  it('maps the summary, the segments, the feeds and the profile', () => {
    const m = mapRacePlan([call('plan_race', { error: 'older' }), call('plan_race', result)]);
    expect(m).toMatchObject({
      courseId: 12,
      name: 'Lefkara Classic',
      distanceM: 74500,
      gainM: 1135,
      durationS: 12024,
      avgSpeedKmh: 22.3,
      npW: 152,
      intensityFactor: 0.83,
      tss: 231,
      carbsPerHour: 80,
      fluidPerHour: 500,
      drafting: true,
    });
    expect(m?.segments).toEqual([
      { kind: 'flat', startM: 0, distanceM: 8025, gradePct: 0.3, lowW: 130, highW: 145, pctFtp: 76, durationS: 1080, startS: 0, eased: false },
      { kind: 'climb', startM: 8025, distanceM: 6100, gradePct: 5.3, lowW: 165, highW: 185, pctFtp: 95, durationS: 1680, startS: 1080, eased: true },
    ]);
    expect(m?.feeds).toEqual([{ atS: 1020, atM: 7600, carbsG: 27, fluidMl: 170 }]);
    expect(m?.profile).toEqual([
      [0, 100],
      [600, 102.5],
    ]);
  });

  it('survives a bare result', () => {
    const m = mapRacePlan([call('plan_race', { summary: {}, segments: [{ kind: 'descent' }] })]);
    expect(m).toMatchObject({ courseId: 0, name: null, durationS: 0, drafting: false, profile: [], feeds: [] });
    expect(m?.segments[0]).toMatchObject({ kind: 'descent', lowW: 0, eased: false });
  });

  it('is null when nothing was planned', () => {
    expect(mapRacePlan(undefined)).toBeNull();
    expect(mapRacePlan([call('plan_race', result, 'running' as ToolCall['status'])])).toBeNull();
    expect(mapRacePlan([call('plan_race', { error: 'no_rider_numbers', message: 'x' })])).toBeNull();
    expect(mapRacePlan([call('plan_race', { summary: {}, segments: [] })])).toBeNull();
    expect(mapRacePlan([call('plan_race', 'text')])).toBeNull();
    expect(mapRacePlan([call('get_calendar', result)])).toBeNull();
  });
});
