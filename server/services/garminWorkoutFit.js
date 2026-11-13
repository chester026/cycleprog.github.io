// A session's blocks as a FIT workout file — what the Edge's own workout
// player runs (docs/plans/garmin-edge-workouts.md §3). The BikeLab app on
// the Edge downloads it from GET /api/garmin/sessions/:id/fit and hands it
// to the device; from there targets, the step timer and the alerts are
// Garmin's.
//
// Layout (Garmin FIT SDK, "workout" file type): file_id, workout, then one
// workout_step per step. A set is its steps once followed by a repeat step
// that points back at the first of them — `toDeviceSteps` (shared) folds the
// stored flat list into that shape.
//
// The SDK's encoder takes main fields only, so the values that the profile
// describes through sub-fields are written raw here: a time duration in
// milliseconds, a distance in centimetres, absolute watts +1000, absolute
// bpm +100.
const { toDeviceSteps } = require('@bikelab/shared/calendar');

const WATTS_OFFSET = 1000;
const BPM_OFFSET = 100;
// The player shows a step's note when the step starts. There is no documented
// limit; this is a guess that keeps a two-sentence cue whole.
const NOTES_MAX = 200;
const NAME_MAX = 40;

const INTENSITY = { warmup: 'warmup', work: 'active', steady: 'active', recovery: 'recovery', cooldown: 'cooldown' };

function trimTo(text, max) {
  const str = String(text ?? '').trim();
  return str.length <= max ? str : `${str.slice(0, max - 1).trimEnd()}…`;
}

/**
 * "85-95 rpm · Hold the watts." — the cadence goes into the note, see the
 * plan's decisions. A plain hyphen: the Edge's fonts are not sure to have an
 * en dash.
 */
function stepNotes(step) {
  const cadence = step.cadence
    ? `${step.cadence.low === step.cadence.high ? step.cadence.low : `${step.cadence.low}-${step.cadence.high}`} rpm`
    : null;
  const text = [cadence, step.cue].filter(Boolean).join(' · ');
  return text ? trimTo(text, NOTES_MAX) : null;
}

function stepMessage(step, messageIndex) {
  // A block that ends after a distance (a race plan's climbs and flats):
  // the Edge counts the metres down, so the plan stays on the road whatever
  // the speed turns out to be. Raw value: centimetres.
  const duration = step.distance_m
    ? { durationType: 'distance', durationValue: Math.round(step.distance_m * 100) }
    : { durationType: 'time', durationValue: step.duration_s * 1000 };
  const message = {
    messageIndex,
    ...duration,
    intensity: INTENSITY[step.kind] || 'active',
  };
  if (step.target && step.target.unit === 'w') {
    Object.assign(message, {
      targetType: 'power',
      targetValue: 0, // 0 = no predefined zone, the custom range below
      customTargetValueLow: step.target.low + WATTS_OFFSET,
      customTargetValueHigh: step.target.high + WATTS_OFFSET,
    });
  } else if (step.target && step.target.unit === 'bpm') {
    Object.assign(message, {
      targetType: 'heartRate',
      targetValue: 0,
      customTargetValueLow: step.target.low + BPM_OFFSET,
      customTargetValueHigh: step.target.high + BPM_OFFSET,
    });
  } else {
    message.targetType = 'open';
  }
  const notes = stepNotes(step);
  if (notes) message.notes = notes;
  return message;
}

/** The workout_step messages of a workout, in file order. Pure — unit-tested without the SDK. */
function workoutStepMessages(workout) {
  const messages = [];
  for (const item of toDeviceSteps(workout)) {
    if (item.type === 'step') {
      messages.push(stepMessage(item, messages.length));
      continue;
    }
    const first = messages.length;
    for (const step of item.steps) messages.push(stepMessage(step, messages.length));
    messages.push({
      messageIndex: messages.length,
      durationType: 'repeatUntilStepsCmplt',
      durationValue: first, // go back to this step…
      targetType: 'open',
      targetValue: item.times, // …until the set has been ridden this many times
    });
  }
  return messages;
}

/**
 * Encodes the workout. `id` makes the file unique on the device (a FIT file
 * is identified by type + manufacturer + product + serial number), `name` is
 * what the Edge lists it under.
 */
async function encodeWorkoutFit({ id, name, workout, createdAt = new Date() }) {
  const { Encoder, Profile } = await import('@garmin/fitsdk');
  const encoder = new Encoder();
  const steps = workoutStepMessages(workout);

  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    serialNumber: Number(id),
    timeCreated: createdAt,
  });
  encoder.onMesg(Profile.MesgNum.WORKOUT, {
    sport: 'cycling',
    numValidSteps: steps.length,
    wktName: trimTo(name || 'BikeLab', NAME_MAX),
  });
  for (const step of steps) encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, step);
  return Buffer.from(encoder.close());
}

module.exports = { encodeWorkoutFit, workoutStepMessages, stepNotes, NOTES_MAX, NAME_MAX };
