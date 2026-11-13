import { describe, expect, it } from 'vitest';
import { buildCourse, parseGpx, COURSE_MAX_SEGMENTS, COURSE_PROFILE_POINTS, type Course, type CoursePoint } from './course.js';
import { courseOf } from './courseFixture.js';

const built = (points: CoursePoint[], name: string | null = null): Course => {
  const r = buildCourse(points, name);
  if (!r.ok) throw new Error(r.error);
  return r.course;
};

describe('parseGpx', () => {
  it('reads a track with its name and altitudes', () => {
    const gpx = `<?xml version="1.0"?><gpx><metadata><name>File</name></metadata><trk><name><![CDATA[Lefkara &amp; Classic]]></name><trkseg>
      <trkpt lat="34.7000" lon="33.0000"><ele>120.5</ele><time>2026-01-01T00:00:00Z</time></trkpt>
      <trkpt lon='33.0010' lat='34.7010'><ele> 130 </ele></trkpt>
      <trkpt lat="34.7020" lon="33.0020"/>
      <trkpt lat="34.7030" lon="33.0030"><ele>abc</ele></trkpt>
      <trkpt lat="95" lon="33"><ele>1</ele></trkpt>
      <trkpt lon="33"><ele>1</ele></trkpt>
    </trkseg></trk></gpx>`;
    const { name, points } = parseGpx(gpx);
    expect(name).toBe('Lefkara & Classic');
    expect(points).toEqual([
      { lat: 34.7, lon: 33, ele: 120.5 },
      { lat: 34.701, lon: 33.001, ele: 130 },
      { lat: 34.702, lon: 33.002, ele: null },
      { lat: 34.703, lon: 33.003, ele: null },
    ]);
  });

  it('falls back to route points, and to the file name or none', () => {
    const route = parseGpx('<gpx><rte><name>Loop &lt;A&gt; &quot;x&quot; &apos;y&apos;</name><rtept lat="1" lon="2"><ele>3</ele></rtept></rte></gpx>');
    expect(route).toEqual({ name: 'Loop <A> "x" \'y\'', points: [{ lat: 1, lon: 2, ele: 3 }] });
    expect(parseGpx('<gpx><metadata><name>Only file</name></metadata><trk><trkseg><trkpt lat="1" lon="2"></trkpt></trkseg></trk></gpx>').name).toBe('Only file');
    expect(parseGpx('<gpx><trk><name> </name></trk></gpx>')).toEqual({ name: null, points: [] });
    expect(parseGpx('not xml at all')).toEqual({ name: null, points: [] });
  });
});

describe('buildCourse', () => {
  it('measures a course and cuts it into climbs, flats and descents that cover it', () => {
    const course = built(courseOf([[5000, 0], [4000, 6], [3000, -5], [6000, 0.5]]), 'Test');
    expect(course.name).toBe('Test');
    expect(course.distance_m).toBeGreaterThan(17950);
    expect(course.distance_m).toBeLessThan(18050);
    expect(course.gain_m).toBeGreaterThan(255);
    expect(course.gain_m).toBeLessThan(275);
    expect(course.segments.map((s) => s.kind)).toEqual(['flat', 'climb', 'descent', 'flat']);
    const [flat, climb, descent, last] = course.segments;
    expect(flat.start_m).toBe(0);
    expect(climb.start_m).toBeGreaterThan(4800);
    expect(climb.start_m).toBeLessThan(5200);
    expect(climb.distance_m).toBeGreaterThan(3800);
    expect(climb.grade_pct).toBeGreaterThan(5.5);
    expect(climb.gain_m).toBeGreaterThan(220);
    expect(descent.grade_pct).toBeLessThan(-4.5);
    expect(descent.gain_m).toBe(0);
    // no gaps: each segment starts where the one before ends, the last ends at the finish
    for (let i = 1; i < course.segments.length; i += 1) {
      expect(course.segments[i].start_m).toBe(course.segments[i - 1].start_m + course.segments[i - 1].distance_m);
    }
    expect(last.start_m + last.distance_m).toBe(course.distance_m);
    expect(course.profile).toHaveLength(COURSE_PROFILE_POINTS);
    expect(course.profile[0]).toEqual([0, 100]);
    expect(course.profile[COURSE_PROFILE_POINTS - 1][0]).toBeGreaterThan(17900);
  });

  it("uses the file's own distance when every point has one", () => {
    const points = courseOf([[3000, 0]]).map((p, i) => ({ ...p, dist: 1000 + i * 100 }));
    expect(built(points).distance_m).toBe(6000);
    // a distance that goes backwards is not trusted
    const broken = points.map((p, i) => (i === 5 ? { ...p, dist: 0 } : p));
    expect(built(broken).distance_m).toBeGreaterThan(2950);
    expect(built(broken).distance_m).toBeLessThan(3050);
    expect(built(points.map((p, i) => (i === 3 ? { ...p, dist: null } : p))).distance_m).toBeLessThan(3050);
  });

  it('fills points without an altitude from their neighbours', () => {
    const points = courseOf([[2000, 0], [2000, 5]]).map((p, i) => (i % 3 === 1 ? { ...p, ele: null } : p));
    const course = built(points);
    expect(course.segments.map((s) => s.kind)).toEqual(['flat', 'climb']);
    expect(course.gain_m).toBeGreaterThan(90);

    // no altitude at the start, a duplicate first position, none at the end
    const edges = courseOf([[3000, 0]]);
    const open = [{ ...edges[0], ele: null }, { ...edges[0] }, ...edges.slice(1, -5), ...edges.slice(-5).map((p) => ({ ...p, ele: null }))];
    expect(built(open).gain_m).toBe(0);
    expect(built(open).profile[COURSE_PROFILE_POINTS - 1][1]).toBe(100);
  });

  it('refuses a course that is too short or has no altitude', () => {
    expect(buildCourse([])).toEqual({ ok: false, error: 'too_short' });
    expect(buildCourse(courseOf([[500, 0]]))).toEqual({ ok: false, error: 'too_short' });
    expect(buildCourse(courseOf([[3000, 0]]).map((p) => ({ ...p, ele: null })))).toEqual({ ok: false, error: 'no_elevation' });
    expect(buildCourse(courseOf([[3000, 0]]).map((p, i) => (i % 5 ? { ...p, ele: null } : p)))).toEqual({ ok: false, error: 'no_elevation' });
  });

  it('folds bumps into their neighbours, the first one into what follows', () => {
    // a 200 m ramp at the very start, then flat with a 150 m dip in the middle
    const course = built(courseOf([[200, 8], [3000, 0], [150, -7], [3000, 0]], 25));
    expect(course.segments.map((s) => s.kind)).toEqual(['flat']);
    expect(course.segments[0].start_m).toBe(0);
  });

  it('keeps a rolling course to a list a rider can follow', () => {
    const legs: Array<[number, number]> = [];
    // forty short hills of growing length; the shortest ones are merged away first
    for (let i = 0; i < 40; i += 1) legs.push([500 + i * 20, i % 2 ? -5 : 5]);
    const course = built(courseOf(legs, 25));
    expect(course.segments.length).toBeLessThanOrEqual(COURSE_MAX_SEGMENTS);
    expect(course.segments.length).toBeGreaterThan(3);
    for (let i = 1; i < course.segments.length; i += 1) {
      expect(course.segments[i].kind).not.toBe(course.segments[i - 1].kind);
      expect(course.segments[i].start_m).toBe(course.segments[i - 1].start_m + course.segments[i - 1].distance_m);
    }
    // the shortest run at either end of the course has one neighbour to join
    const even: Array<[number, number]> = Array.from({ length: 40 }, (_, i) => [900, i % 2 ? 5 : -5]);
    for (const edge of [
      [[450, 5], ...even] as Array<[number, number]>,
      [...even, [450, 5]] as Array<[number, number]>,
    ]) {
      const c = built(courseOf(edge, 25));
      expect(c.segments.length).toBeLessThanOrEqual(COURSE_MAX_SEGMENTS);
      expect(c.segments[c.segments.length - 1].start_m + c.segments[c.segments.length - 1].distance_m).toBe(c.distance_m);
    }
  });

  it('thins a file with more points than it needs', () => {
    const dense = courseOf([[60000, 0]], 1);
    expect(dense.length).toBeGreaterThan(50000);
    const course = built(dense);
    expect(course.distance_m).toBeGreaterThan(59900);
    expect(course.segments).toHaveLength(1);
  });
});
