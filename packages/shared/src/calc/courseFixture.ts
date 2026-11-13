// Test fixture (course.test.ts, racePlan.test.ts): a course drawn from legs.
import type { CoursePoint } from './course.js';

/** Metres of latitude per degree — points laid along a meridian are this far apart. */
const M_PER_DEG = 111194.9;

/**
 * A course from `[metres, grade %]` legs, starting at 100 m, one point every
 * `every` metres along a meridian.
 */
export function courseOf(legs: Array<[number, number]>, every = 50): CoursePoint[] {
  const points: CoursePoint[] = [];
  let dist = 0;
  let ele = 100;
  points.push({ lat: 34.7, lon: 33, ele });
  for (const [metres, grade] of legs) {
    for (let d = every; d <= metres; d += every) {
      dist += every;
      ele += (every * grade) / 100;
      points.push({ lat: 34.7 + dist / M_PER_DEG, lon: 33, ele });
    }
  }
  return points;
}
