// The week's sessions and one session's blocks for the bike computer
// (docs/plans/garmin-edge-workouts.md): GET /api/garmin/week,
// /api/garmin/sessions/:id and its workout file. HTTP in routes/garmin.js,
// the FIT encoding in services/garminWorkoutFit.js.
//
// A reader, like `buildHome`: the calendar and the coach stay the only
// writers. The payloads are shaped for a device with little memory —
// positional arrays, short keys, trimmed strings, no nulls inside the blocks
// (contract/garmin.ts says why).
const crypto = require('crypto');
const { ApiError } = require('../lib/apiError');
const calendarRepo = require('../repositories/calendar');
const { GARMIN_BLOCK_KINDS, GARMIN_TARGET_UNITS } = require('@bikelab/shared/api');
const { addDaysStr, eventDurationMinutes, isValidDateString, workoutMinutes } = require('@bikelab/shared/calendar');
const { encodeWorkoutFit } = require('./garminWorkoutFit');

const WEEK_DAYS = 7;
const MAX_SESSIONS = 14;
const TITLE_MAX = 40;
// Per block; 60 blocks of this still fit a device app's memory comfortably.
const CUE_MAX = 160;

/**
 * Text as an Edge can draw it: its fonts lack the typographic marks the
 * coach's headlines use (8′, 240–250 W), and a missing glyph is a box.
 */
function deviceText(text) {
  return String(text ?? '')
    .replace(/[′’‘]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimTo(text, max) {
  const str = deviceText(text);
  return str.length <= max ? str : `${str.slice(0, max - 3).trimEnd()}...`;
}

function blocksOf(event) {
  const steps = event.workout && Array.isArray(event.workout.steps) ? event.workout.steps : [];
  return steps;
}

function minutesOf(event) {
  if (blocksOf(event).length) return workoutMinutes(event.workout);
  return eventDurationMinutes(event.start_time, event.end_time) ?? 0;
}

/** Changes whenever the title or a block does — the device keeps a downloaded workout until then. */
function versionOf(event) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([event.title, event.workout || null]))
    .digest('hex')
    .slice(0, 8);
}

const isEffort = (step) => step.kind === 'work' || step.kind === 'steady';

function mapWeekSession(event) {
  return {
    id: Number(event.id),
    t: trimTo(event.title, TITLE_MAX),
    min: minutesOf(event),
    done: event.completed === true,
    u: versionOf(event),
    b: blocksOf(event).map((step) => [step.duration_s, step.zone, isEffort(step) ? 1 : 0]),
  };
}

/** calendar_events rows (ordered by date) → the week payload. Pure. */
function mapWeek(events, from) {
  const days = [];
  for (const event of events.slice(0, MAX_SESSIONS)) {
    const day = String(event.start_date).slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.d === day) last.ev.push(mapWeekSession(event));
    else days.push({ d: day, ev: [mapWeekSession(event)] });
  }
  return { v: 1, from, days };
}

function mapSessionBlock(step) {
  const unit = step.target ? GARMIN_TARGET_UNITS.indexOf(step.target.unit) : 0;
  return [
    step.duration_s,
    step.zone,
    Math.max(0, GARMIN_BLOCK_KINDS.indexOf(step.kind)),
    step.rep || 0,
    step.reps || 0,
    Math.max(0, unit),
    step.target ? Math.round(step.target.low) : 0,
    step.target ? Math.round(step.target.high) : 0,
    step.cadence ? Math.round(step.cadence.low) : 0,
    step.cadence ? Math.round(step.cadence.high) : 0,
    step.cue ? trimTo(step.cue, CUE_MAX) : '',
  ];
}

/** One calendar_events row → the session payload. Pure. */
function mapSession(event) {
  return {
    v: 1,
    id: Number(event.id),
    t: trimTo(event.title, TITLE_MAX),
    d: String(event.start_date).slice(0, 10),
    min: minutesOf(event),
    done: event.completed === true,
    u: versionOf(event),
    b: blocksOf(event).map(mapSessionBlock),
  };
}

/**
 * What the Edge lists the workout under (Training → Workouts): "11.03
 * 3×8' @ 240-250 W". The day comes first so two sessions with the same
 * headline stay apart — the app finds a downloaded workout by this name —
 * and survive a device that cuts long names.
 */
function workoutName(event) {
  const [, month, day] = String(event.start_date).slice(0, 10).split('-');
  return trimTo(`${day}.${month} ${event.title}`, TITLE_MAX);
}

async function buildWeek(userId, from) {
  if (!isValidDateString(from)) throw new ApiError(400, 'VALIDATION_ERROR', 'from must be a date, YYYY-MM-DD');
  const events = await calendarRepo.listEvents(userId, { from, to: addDaysStr(from, WEEK_DAYS - 1), type: 'planned_ride' });
  return mapWeek(events, from);
}

async function loadSession(userId, rawId) {
  // The file route is outside the contract, so the id arrives as the raw
  // path segment; anything that is not a row id is simply not a session.
  const id = Number(rawId);
  const event = Number.isInteger(id) && id > 0 ? await calendarRepo.getEvent(id, userId) : null;
  if (!event || event.type !== 'planned_ride') throw new ApiError(404, 'GARMIN_SESSION_NOT_FOUND', 'Session not found');
  return event;
}

async function buildSession(userId, id) {
  return mapSession(await loadSession(userId, id));
}

/** The session as a FIT workout file: `{ buffer, filename }`. 409 when it has no blocks to run. */
async function buildSessionFit(userId, id) {
  const event = await loadSession(userId, id);
  if (!blocksOf(event).length) throw new ApiError(409, 'GARMIN_SESSION_NO_BLOCKS', 'This session has no workout blocks');
  // The cues go into the file as the device will draw them.
  const workout = { ...event.workout, steps: event.workout.steps.map((step) => ({ ...step, cue: step.cue ? deviceText(step.cue) : null })) };
  const buffer = await encodeWorkoutFit({
    id: event.id,
    name: workoutName(event),
    workout,
    createdAt: event.updated_at ? new Date(event.updated_at) : new Date(),
  });
  return { buffer, filename: `bikelab-${Number(event.id)}.fit` };
}

module.exports = { buildWeek, buildSession, buildSessionFit, mapWeek, mapSession, deviceText, versionOf, workoutName, WEEK_DAYS, MAX_SESSIONS, TITLE_MAX, CUE_MAX };
