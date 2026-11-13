// Race plans (docs/plans/race-plan.md): a route file → a stored course →
// a plan for this rider → the blocks of a calendar session.
//
//   readCourseFile   bytes of a GPX or a FIT file → { name, source, points }
//   createCourse     …→ the stored course and what the coach is told of it
//   planRace         course + the rider's FTP, weight and W′ → RacePlan, stored
//   workoutForCourse the stored plan as a calendar `Workout` (distance blocks)
//
// The maths is @bikelab/shared/calc (course.ts, racePlan.ts); here are the
// file formats, the rider's numbers and the storage.
const logger = require('../lib/logger');
const { parseGpx, buildCourse, racePlan } = require('@bikelab/shared/calc');
const raceCoursesRepo = require('../repositories/raceCourses');
const powerProfileService = require('./powerProfile');
const bikesRepo = require('../repositories/bikes');

/** A route file is refused past this size (a day-long 1 Hz FIT is ~2 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** FIT stores positions as signed 32-bit "semicircles". */
const SEMICIRCLE_DEG = 180 / 2 ** 31;
const NAME_MAX = 120;
// Retention (owner, 2026-11-13: "we'll only clog the database"). The route
// file itself is never stored — a row is the derived course and its plan,
// about 20 KB. A rider keeps their newest MAX_COURSES_PER_RIDER; a course not
// uploaded or re-planned for COURSE_RETENTION_DAYS is deleted by the daily
// cleanup (server.js). A race already in the calendar is not affected: the
// event holds its own copy of the blocks.
const MAX_COURSES_PER_RIDER = 5;
const COURSE_RETENTION_DAYS = 60;

class CourseFileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CourseFileError';
    this.code = code;
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A FIT file says so in bytes 8–11 of its header. */
function isFit(buffer) {
  return buffer.length >= 12 && buffer.toString('ascii', 8, 12) === '.FIT';
}

/**
 * The points of a FIT course or activity: its `record` messages carry
 * position, altitude and distance in both. Name: the course's, else none.
 */
async function readFit(buffer) {
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const decoder = new Decoder(Stream.fromBuffer(buffer));
  if (!decoder.isFIT()) throw new CourseFileError('unreadable', 'Not a FIT file');
  // The decoder reports a damaged file in `errors` instead of throwing; a
  // file that gave up no records at all is not one to plan from.
  const { messages, errors } = decoder.read();
  if (errors.length && !(messages.recordMesgs || []).length) throw new CourseFileError('unreadable', 'The FIT file is damaged');
  const points = [];
  for (const record of messages.recordMesgs || []) {
    const lat = num(record.positionLat);
    const lon = num(record.positionLong);
    if (lat === null || lon === null) continue;
    points.push({
      lat: lat * SEMICIRCLE_DEG,
      lon: lon * SEMICIRCLE_DEG,
      ele: num(record.enhancedAltitude) ?? num(record.altitude),
      dist: num(record.distance),
    });
  }
  const name = messages.courseMesgs?.[0]?.name;
  return { name: typeof name === 'string' && name.trim() ? name.trim() : null, source: 'fit', points };
}

/** `{ name, source: 'gpx' | 'fit', points }` from a route file's bytes. */
async function readCourseFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new CourseFileError('unreadable', 'The file is empty');
  if (buffer.length > MAX_FILE_BYTES) throw new CourseFileError('too_large', 'The file is larger than 10 MB');
  if (isFit(buffer)) {
    try {
      return await readFit(buffer);
    } catch (err) {
      if (err instanceof CourseFileError) throw err;
      throw new CourseFileError('unreadable', `Could not read the FIT file (${err.message})`);
    }
  }
  const text = buffer.toString('utf8');
  if (!/<gpx[\s>]/i.test(text)) throw new CourseFileError('unreadable', 'The file is neither a GPX nor a FIT file');
  return { ...parseGpx(text), source: 'gpx' };
}

/** The file's name without its extension — the course's name when the file has none inside. */
function nameFromFile(filename) {
  const base = String(filename || '').replace(/^.*[\\/]/, '').replace(/\.(gpx|fit)$/i, '').trim();
  return base || null;
}

/** What the coach and the app are told about a course: no profile, the climbs worth naming. */
function summarizeCourse(row) {
  const { course } = row;
  return {
    course_id: Number(row.id),
    name: row.name,
    distance_km: Math.round(course.distance_m / 100) / 10,
    elevation_gain_m: course.gain_m,
    climbs: course.segments
      .filter((s) => s.kind === 'climb')
      .map((s) => ({
        at_km: Math.round(s.start_m / 100) / 10,
        length_km: Math.round(s.distance_m / 100) / 10,
        grade_pct: s.grade_pct,
        gain_m: s.gain_m,
      })),
  };
}

/**
 * Reads the file, builds the course and stores it. Throws CourseFileError
 * (`unreadable` / `too_large` / `too_short` / `no_elevation`) — the route
 * turns it into a 400 the app can explain.
 */
async function createCourse(userId, { buffer, filename }) {
  const file = await readCourseFile(buffer);
  const name = (file.name || nameFromFile(filename) || '').slice(0, NAME_MAX) || null;
  const built = buildCourse(file.points, name);
  if (!built.ok) {
    throw new CourseFileError(
      built.error,
      built.error === 'no_elevation' ? 'The route has no elevation data, so the climbs cannot be planned' : 'The route is shorter than a kilometre or has no track points',
    );
  }
  const row = await raceCoursesRepo.createCourse(userId, { name, source: file.source, course: built.course });
  try {
    await raceCoursesRepo.pruneCourses(userId, MAX_COURSES_PER_RIDER);
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[racePlans] pruning old courses failed');
  }
  return summarizeCourse(row);
}

/** The rider's numbers a plan needs; `ftp` / `weight_kg` null when unknown. */
async function riderFor(userId) {
  let profile = null;
  try {
    profile = await powerProfileService.getPowerProfile(userId, { weeks: 12 });
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[racePlans] power profile unavailable');
  }
  const ftp = profile?.ftp?.watts ?? null;
  const wPrime = profile?.ftp?.cp?.wPrime ?? profile?.ftp?.estimated?.cp?.wPrime ?? null;
  return { ftp, weight_kg: await bikesRepo.getRiderWeight(userId), w_prime_j: wPrime };
}

const PLAN_OPTIONS = ['drafting', 'effort', 'carbs_g_per_h', 'temp_c', 'lang'];

/** Seconds from the start at which the plan reaches `metres` along the course. */
function etaAt(segments, metres) {
  const last = segments[segments.length - 1];
  const seg = segments.find((s) => metres < s.start_m + s.distance_m) || last;
  const share = Math.min(1, Math.max(0, (metres - seg.start_m) / seg.distance_m));
  return seg.start_s + share * seg.duration_s;
}

/**
 * The plan against the race's time limits: for each `{ km, minutes_from_start }`
 * — when the plan gets there and how much room is left. A limit past the
 * finish is checked at the finish. Entries that are not numbers are dropped.
 */
function checkCutoffs(plan, cutoffs) {
  if (!Array.isArray(cutoffs)) return [];
  const finish = plan.summary.distance_m;
  return cutoffs
    .filter((c) => c && num(c.km) !== null && num(c.minutes_from_start) !== null && c.km > 0 && c.minutes_from_start > 0)
    .map((c) => {
      const metres = Math.min(finish, c.km * 1000);
      const eta = metres >= finish ? plan.summary.duration_s : etaAt(plan.segments, metres);
      const etaMin = Math.round(eta / 60);
      return {
        km: Math.round(metres / 100) / 10,
        limit_min: Math.round(c.minutes_from_start),
        eta_min: etaMin,
        margin_min: Math.round(c.minutes_from_start) - etaMin,
        ok: Math.round(c.minutes_from_start) >= etaMin,
      };
    });
}

/**
 * The rider's uploaded routes as a system-prompt section, so a route attached
 * earlier — in this conversation or another — can be planned again without
 * the file. '' when there are none or the lookup fails.
 */
async function routesPromptSection(userId) {
  if (!userId) return '';
  let rows;
  try {
    rows = await raceCoursesRepo.listRecentCourses(userId);
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[racePlans] routes lookup failed');
    return '';
  }
  if (!rows.length) return '';
  const lines = rows.map((r) => {
    const planned = r.plan_summary
      ? `planned: ~${Math.round(r.plan_summary.duration_s / 60)} min, ${r.plan_summary.drafting ? 'in a bunch' : 'solo'}, ${r.plan_summary.effort}`
      : 'not planned yet';
    return `- [Route ${r.id}] ${r.name || 'Unnamed route'} — ${Math.round(Number(r.distance_m) / 100) / 10} km, ${Number(r.gain_m)} m↑, uploaded ${new Date(r.created_at).toISOString().slice(0, 10)}; ${planned}`;
  });
  return `\n## Rider's routes\nRoute files the rider has already uploaded (newest first). They stay on the server: to plan or re-plan one, call plan_race with its course_id — NEVER ask the rider to attach a file that is listed here again. When they say "the race", "the route" or "re-plan" without a new file, they mean the newest one unless the conversation says otherwise.\n${lines.join('\n')}\n`;
}

/**
 * Plans the race on a stored course and keeps the plan. Never throws — the
 * caller is an LLM tool executor: what cannot be planned comes back as
 * `{ error, message }` the model can act on.
 */
async function planRace(userId, courseId, options = {}) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return { error: 'bad_course_id', message: 'course_id must be the id of an attached route.' };
  const row = await raceCoursesRepo.getCourse(userId, id);
  if (!row) return { error: 'not_found', message: `No route ${id} for this rider. Ask them to attach the GPX or FIT file of the course.` };
  const rider = await riderFor(userId);
  if (!rider.ftp || !rider.weight_kg) {
    return {
      error: 'no_rider_numbers',
      message: `A race plan needs the rider's FTP and weight; missing: ${[!rider.ftp && 'FTP (no power-meter rides and no manual FTP)', !rider.weight_kg && 'weight'].filter(Boolean).join(', ')}. Ask for them and save them with update_rider_profile, then plan again.`,
    };
  }
  const opts = {};
  for (const key of PLAN_OPTIONS) if (options[key] !== undefined && options[key] !== null) opts[key] = options[key];
  const plan = racePlan(row.course, rider, opts);
  if (!plan) return { error: 'no_plan', message: 'The route has no segments to plan.' };
  await raceCoursesRepo.savePlan(userId, id, plan, opts);
  const { steps, ...rest } = plan;
  const cutoffs = checkCutoffs(plan, options.cutoffs);
  return {
    ...summarizeCourse(row),
    rider: { ftp_w: rider.ftp, weight_kg: rider.weight_kg, w_prime_kj: rider.w_prime_j ? Math.round(rider.w_prime_j / 100) / 10 : null },
    ...rest,
    // The profile is for the app's card; the model has the segments.
    profile: row.course.profile,
    blocks: steps.length,
    ...(cutoffs.length ? { cutoffs } : {}),
  };
}

/**
 * The stored plan as a calendar `Workout`, or `{ error }` when the course is
 * not this rider's or has not been planned yet.
 */
async function workoutForCourse(userId, courseId) {
  const row = await raceCoursesRepo.getCourse(userId, Number(courseId));
  if (!row) return { error: `race_course_id ${courseId} not found` };
  if (!row.plan?.steps?.length) return { error: `route ${courseId} has no plan yet — call plan_race first` };
  const steps = row.plan.steps;
  return { workout: { version: 1, duration_s: steps.reduce((sum, s) => sum + s.duration_s, 0), steps }, name: row.name };
}

/** Words of a name worth matching on: lower-case, three characters or more. */
function nameWords(text) {
  return new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

/**
 * The rider's newest PLANNED course whose name shares words with `title`
 * (two, or the course's only one) — for a race put in the calendar without
 * its course_id: `{ workout, course_id }` or null. Never throws.
 */
async function matchPlannedCourse(userId, title) {
  const wanted = nameWords(title);
  if (!wanted.size) return null;
  try {
    const rows = await raceCoursesRepo.listRecentCourses(userId);
    for (const row of rows) {
      if (!row.plan_summary) continue;
      const words = nameWords(row.name);
      const shared = [...words].filter((w) => wanted.has(w)).length;
      if (shared >= Math.min(2, words.size) && shared > 0) {
        const planned = await workoutForCourse(userId, row.id);
        if (planned.workout) return { workout: planned.workout, course_id: Number(row.id) };
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[racePlans] matching a course to an event failed');
  }
  return null;
}

module.exports = { matchPlannedCourse, MAX_COURSES_PER_RIDER, COURSE_RETENTION_DAYS, readCourseFile, createCourse, planRace, workoutForCourse, checkCutoffs, routesPromptSection, summarizeCourse, nameFromFile, CourseFileError, MAX_FILE_BYTES };
