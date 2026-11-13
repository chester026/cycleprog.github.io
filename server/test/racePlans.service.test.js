// services/racePlans.js (docs/plans/race-plan.md): route files → course →
// plan, with the repository, the power profile and the weight stubbed. The
// maths is covered in @bikelab/shared (course.test.ts, racePlan.test.ts).
const raceCoursesRepo = require('../repositories/raceCourses');
const powerProfileService = require('../services/powerProfile');
const bikesRepo = require('../repositories/bikes');
const service = require('../services/racePlans');

const M_PER_DEG = 111194.9;

/** Points of a course from `[metres, grade %]` legs, 50 m apart along a meridian. */
function pointsOf(legs) {
  const points = [{ lat: 34.7, lon: 33, ele: 100, dist: 0 }];
  let dist = 0;
  let ele = 100;
  for (const [metres, grade] of legs) {
    for (let d = 50; d <= metres; d += 50) {
      dist += 50;
      ele += (50 * grade) / 100;
      points.push({ lat: 34.7 + dist / M_PER_DEG, lon: 33, ele, dist });
    }
  }
  return points;
}

function gpxOf(points, name = 'Lefkara Classic') {
  const body = points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`).join('');
  return Buffer.from(`<?xml version="1.0"?><gpx version="1.1"><trk><name>${name}</name><trkseg>${body}</trkseg></trk></gpx>`);
}

async function fitCourseOf(points, name) {
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: 'course', manufacturer: 'development', product: 0, serialNumber: 1, timeCreated: new Date() });
  if (name !== undefined) encoder.onMesg(Profile.MesgNum.COURSE, { name, sport: 'cycling' });
  points.forEach((p, i) => {
    encoder.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(Date.UTC(2026, 10, 15, 6, 0, i)),
      ...(p.lat === null ? {} : { positionLat: Math.round(p.lat / (180 / 2 ** 31)), positionLong: Math.round(p.lon / (180 / 2 ** 31)) }),
      altitude: p.ele,
      distance: p.dist,
    });
  });
  return Buffer.from(encoder.close());
}

const LEGS = [[5000, 0], [4000, 6], [3000, -5], [6000, 0.5]];

describe('services/racePlans.readCourseFile', () => {
  it('reads a GPX track', async () => {
    const file = await service.readCourseFile(gpxOf(pointsOf(LEGS)));
    expect(file.source).toBe('gpx');
    expect(file.name).toBe('Lefkara Classic');
    expect(file.points).toHaveLength(361);
    expect(file.points[0]).toEqual({ lat: 34.7, lon: 33, ele: 100 });
  });

  it('reads a FIT course: positions, altitude, distance and its name', async () => {
    const points = pointsOf(LEGS);
    const withGap = [...points.slice(0, 10), { lat: null, lon: null, ele: 100, dist: 475 }, ...points.slice(10)];
    const file = await service.readCourseFile(await fitCourseOf(withGap, 'Lefkara FIT'));
    expect(file.source).toBe('fit');
    expect(file.name).toBe('Lefkara FIT');
    expect(file.points).toHaveLength(361); // the record without a position is skipped
    expect(file.points[0].lat).toBeCloseTo(34.7, 5);
    expect(file.points[0].lon).toBeCloseTo(33, 5);
    expect(file.points[100]).toMatchObject({ ele: 100, dist: 5000 });
    // a FIT without a course message has no name of its own
    expect((await service.readCourseFile(await fitCourseOf(points))).name).toBeNull();
    expect((await service.readCourseFile(await fitCourseOf(points, '  '))).name).toBeNull();
  });

  it('refuses what is not a route file', async () => {
    await expect(service.readCourseFile(Buffer.alloc(0))).rejects.toMatchObject({ name: 'CourseFileError', code: 'unreadable' });
    await expect(service.readCourseFile('text')).rejects.toMatchObject({ code: 'unreadable' });
    await expect(service.readCourseFile(Buffer.from('just some notes'))).rejects.toMatchObject({ code: 'unreadable' });
    await expect(service.readCourseFile(Buffer.alloc(service.MAX_FILE_BYTES + 1, 0x20))).rejects.toMatchObject({ code: 'too_large' });
    // a FIT header with rubbish behind it
    const broken = Buffer.concat([Buffer.from([14, 0x20, 0, 0, 0xff, 0, 0, 0]), Buffer.from('.FIT'), Buffer.alloc(40, 7)]);
    await expect(service.readCourseFile(broken)).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('nameFromFile drops the folder and the extension', () => {
    expect(service.nameFromFile('/tmp/Lefkara Classic.GPX')).toBe('Lefkara Classic');
    expect(service.nameFromFile('C:\\\\rides\\\\loop.fit')).toBe('loop');
    expect(service.nameFromFile('.gpx')).toBeNull();
    expect(service.nameFromFile(undefined)).toBeNull();
  });
});

describe('services/racePlans.createCourse', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(raceCoursesRepo, 'createCourse').mockImplementation(async (userId, row) => ({ id: '41', ...row }));
    vi.spyOn(raceCoursesRepo, 'pruneCourses').mockResolvedValue(0);
  });

  it("keeps a rider's newest courses only, and an upload survives a failed pruning", async () => {
    await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS)), filename: 'a.gpx' });
    expect(raceCoursesRepo.pruneCourses).toHaveBeenCalledWith(7, service.MAX_COURSES_PER_RIDER);
    raceCoursesRepo.pruneCourses.mockRejectedValueOnce(new Error('db down'));
    expect((await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS)), filename: 'a.gpx' })).course_id).toBe(41);
  });

  it('stores the course and answers what the coach is told about it', async () => {
    const summary = await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS)), filename: 'whatever.gpx' });
    expect(summary).toMatchObject({ course_id: 41, name: 'Lefkara Classic', distance_km: 18, elevation_gain_m: expect.any(Number) });
    expect(summary.climbs).toHaveLength(1);
    expect(summary.climbs[0]).toMatchObject({ at_km: expect.any(Number), length_km: expect.any(Number), grade_pct: expect.any(Number), gain_m: expect.any(Number) });
    expect(summary.climbs[0].length_km).toBeGreaterThan(3.5);
    const [userId, row] = raceCoursesRepo.createCourse.mock.calls[0];
    expect(userId).toBe(7);
    expect(row).toMatchObject({ name: 'Lefkara Classic', source: 'gpx' });
    expect(row.course.segments.map((s) => s.kind)).toEqual(['flat', 'climb', 'descent', 'flat']);
    expect(row.course.profile).toHaveLength(120);
  });

  it("falls back to the file's name, and to none", async () => {
    expect((await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS), ''), filename: 'Sunday race.gpx' })).name).toBe('Sunday race');
    expect((await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS), ''), filename: '' })).name).toBeNull();
  });

  it('refuses a route that cannot be planned from', async () => {
    await expect(service.createCourse(7, { buffer: gpxOf(pointsOf([[500, 0]])), filename: 'a.gpx' })).rejects.toMatchObject({ code: 'too_short' });
    const flatless = pointsOf(LEGS).map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`).join('');
    await expect(service.createCourse(7, { buffer: Buffer.from(`<gpx><trk><trkseg>${flatless}</trkseg></trk></gpx>`), filename: 'a.gpx' })).rejects.toMatchObject({
      code: 'no_elevation',
      message: expect.stringMatching(/no elevation data/),
    });
    expect(raceCoursesRepo.createCourse).not.toHaveBeenCalled();
  });
});

describe('services/racePlans.planRace', () => {
  let row;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(raceCoursesRepo, 'createCourse').mockImplementation(async (userId, r) => ({ id: 41, ...r }));
    vi.spyOn(raceCoursesRepo, 'pruneCourses').mockResolvedValue(0);
    await service.createCourse(7, { buffer: gpxOf(pointsOf(LEGS)), filename: 'a.gpx' });
    row = { id: 41, plan: null, ...raceCoursesRepo.createCourse.mock.calls[0][1] };
    vi.spyOn(raceCoursesRepo, 'getCourse').mockImplementation(async (userId, id) => (userId === 7 && id === 41 ? row : null));
    vi.spyOn(raceCoursesRepo, 'savePlan').mockResolvedValue();
    vi.spyOn(powerProfileService, 'getPowerProfile').mockResolvedValue({ ftp: { watts: 250, cp: { cp: 245, wPrime: 18000 } } });
    vi.spyOn(bikesRepo, 'getRiderWeight').mockResolvedValue(72);
  });

  it("plans with the rider's FTP, weight and W′, stores the plan and answers it without the blocks", async () => {
    const result = await service.planRace(7, 41, { drafting: true, lang: 'ru', temp_c: null, effort: undefined });
    expect(result).toMatchObject({ course_id: 41, name: 'Lefkara Classic', rider: { ftp_w: 250, weight_kg: 72, w_prime_kj: 18 }, blocks: expect.any(Number) });
    expect(result.summary).toMatchObject({ distance_m: 18000, drafting: true, effort: 'race' });
    expect(result.segments).toHaveLength(4);
    expect(result.profile).toHaveLength(120);
    expect(result.steps).toBeUndefined();
    const [userId, id, plan, options] = raceCoursesRepo.savePlan.mock.calls[0];
    expect([userId, id]).toEqual([7, 41]);
    expect(plan.steps.length).toBe(result.blocks);
    expect(plan.steps[0].cue).toMatch(/^Ровно/);
    expect(plan.steps.every((s) => s.distance_m > 0)).toBe(true);
    // only the options that were given are kept
    expect(options).toEqual({ drafting: true, lang: 'ru' });
  });

  it('works without a critical-power fit, and when the profile cannot be read', async () => {
    powerProfileService.getPowerProfile.mockResolvedValueOnce({ ftp: { watts: 250, cp: null, estimated: { cp: { wPrime: 12000 } } } });
    expect((await service.planRace(7, 41)).rider.w_prime_kj).toBe(12);
    powerProfileService.getPowerProfile.mockResolvedValueOnce({ ftp: { watts: 250 } });
    expect((await service.planRace(7, 41)).rider.w_prime_kj).toBeNull();
    powerProfileService.getPowerProfile.mockRejectedValueOnce(new Error('profile down'));
    expect(await service.planRace(7, 41)).toMatchObject({ error: 'no_rider_numbers', message: expect.stringMatching(/missing: FTP/) });
  });

  it('says what is missing instead of planning', async () => {
    expect(await service.planRace(7, 'abc')).toMatchObject({ error: 'bad_course_id' });
    expect(await service.planRace(7, 999)).toMatchObject({ error: 'not_found' });
    expect(await service.planRace(8, 41)).toMatchObject({ error: 'not_found' });
    bikesRepo.getRiderWeight.mockResolvedValueOnce(null);
    expect(await service.planRace(7, 41)).toMatchObject({ error: 'no_rider_numbers', message: expect.stringMatching(/missing: weight/) });
    powerProfileService.getPowerProfile.mockResolvedValueOnce({ ftp: null });
    bikesRepo.getRiderWeight.mockResolvedValueOnce(null);
    expect((await service.planRace(7, 41)).message).toMatch(/FTP .*, weight/);
    row = { ...row, course: { ...row.course, segments: [] } };
    expect(await service.planRace(7, 41)).toMatchObject({ error: 'no_plan' });
    expect(raceCoursesRepo.savePlan).not.toHaveBeenCalled();
  });

  it('workoutForCourse: the stored plan as a calendar workout', async () => {
    expect(await service.workoutForCourse(7, 999)).toEqual({ error: 'race_course_id 999 not found' });
    expect(await service.workoutForCourse(7, 41)).toEqual({ error: 'route 41 has no plan yet — call plan_race first' });
    await service.planRace(7, 41);
    row = { ...row, plan: raceCoursesRepo.savePlan.mock.calls[0][2] };
    const { workout, name } = await service.workoutForCourse(7, '41');
    expect(name).toBe('Lefkara Classic');
    expect(workout.version).toBe(1);
    expect(workout.steps).toBe(row.plan.steps);
    expect(workout.duration_s).toBe(row.plan.steps.reduce((s, b) => s + b.duration_s, 0));
  });
});

describe('services/racePlans — cut-offs and the routes reminder', () => {
  const plan = {
    summary: { distance_m: 20000, duration_s: 3600 },
    segments: [
      { start_m: 0, distance_m: 10000, start_s: 0, duration_s: 1200 },
      { start_m: 10000, distance_m: 10000, start_s: 1200, duration_s: 2400 },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('says when the plan reaches each limit and how much room is left', () => {
    expect(
      service.checkCutoffs(plan, [
        { km: 5, minutes_from_start: 15 },
        { km: 15, minutes_from_start: 35 },
        { km: 20, minutes_from_start: 65 },
        { km: 99, minutes_from_start: 59 },
        { km: 'x', minutes_from_start: 10 },
        { km: 5, minutes_from_start: 0 },
        null,
      ]),
    ).toEqual([
      { km: 5, limit_min: 15, eta_min: 10, margin_min: 5, ok: true },
      { km: 15, limit_min: 35, eta_min: 40, margin_min: -5, ok: false },
      { km: 20, limit_min: 65, eta_min: 60, margin_min: 5, ok: true },
      // a limit past the finish is the finish's
      { km: 20, limit_min: 59, eta_min: 60, margin_min: -1, ok: false },
    ]);
    expect(service.checkCutoffs(plan, undefined)).toEqual([]);
    expect(service.checkCutoffs(plan, 'soon')).toEqual([]);
  });

  it("lists the rider's routes for the system prompt, planned or not", async () => {
    vi.spyOn(raceCoursesRepo, 'listRecentCourses').mockResolvedValue([
      { id: '41', name: 'Lefkara Classic', distance_m: 92300, gain_m: 1480, plan_summary: { duration_s: 12000, drafting: true, effort: 'race' }, created_at: '2026-11-12T10:00:00Z' },
      { id: '40', name: null, distance_m: 18000, gain_m: 265, plan_summary: null, created_at: '2026-11-10T10:00:00Z' },
    ]);
    const section = await service.routesPromptSection(7);
    expect(section).toContain("## Rider's routes");
    expect(section).toContain('NEVER ask the rider to attach a file that is listed here again');
    expect(section).toContain('- [Route 41] Lefkara Classic — 92.3 km, 1480 m↑, uploaded 2026-11-12; planned: ~200 min, in a bunch, race');
    expect(section).toContain('- [Route 40] Unnamed route — 18 km, 265 m↑, uploaded 2026-11-10; not planned yet');
    expect(raceCoursesRepo.listRecentCourses).toHaveBeenCalledWith(7);
  });

  it('is empty without a rider, without routes, or when the lookup fails', async () => {
    const list = vi.spyOn(raceCoursesRepo, 'listRecentCourses').mockResolvedValue([]);
    expect(await service.routesPromptSection(null)).toBe('');
    expect(list).not.toHaveBeenCalled();
    expect(await service.routesPromptSection(7)).toBe('');
    list.mockRejectedValueOnce(new Error('db down'));
    expect(await service.routesPromptSection(7)).toBe('');
    list.mockResolvedValueOnce([{ id: 1, name: 'Solo', distance_m: 1000, gain_m: 0, plan_summary: { duration_s: 600, drafting: false, effort: 'steady' }, created_at: '2026-11-12T10:00:00Z' }]);
    expect(await service.routesPromptSection(7)).toContain('planned: ~10 min, solo, steady');
  });
});
