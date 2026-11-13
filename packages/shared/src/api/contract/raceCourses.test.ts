import { describe, expect, it } from 'vitest';
import { raceCourses } from './raceCourses.js';

describe('raceCourses contract', () => {
  it('upload answers the course summary', () => {
    const ok = raceCourses.upload.response.safeParse({
      course_id: 12,
      name: 'Lefkara Classic',
      distance_km: 92.3,
      elevation_gain_m: 1480,
      climbs: [{ at_km: 8, length_km: 6.1, grade_pct: 5.3, gain_m: 322 }],
    });
    expect(ok.success).toBe(true);
    expect(raceCourses.upload.response.safeParse({ course_id: 'x' }).success).toBe(false);
    expect(raceCourses.upload.multipart).toBe(true);
    expect(raceCourses.upload.response.safeParse({ course_id: 1, name: null, distance_km: 1, elevation_gain_m: 0, climbs: [] }).success).toBe(true);
  });
});
