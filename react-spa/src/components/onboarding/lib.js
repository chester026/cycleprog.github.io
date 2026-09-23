// Pure helpers extracted from OnboardingModal.jsx (T-6.3 decomposition,
// mirroring BikeLabApp/src/screens/Onboarding/lib.ts). No React, no I/O —
// safe to unit test directly.
import { ageFromBirthDate } from '@bikelab/shared/calc';

export const INITIAL_FORM_DATA = {
  height: '',
  weight: '',
  birth_date: '',
  bike_weight: '',
  max_hr: '',
  resting_hr: '',
  lactate_threshold: '',
  gender: '',
  experience_level: 'intermediate',
  email: '', // step 4 only, for Strava users with no email on file yet
};

export const EXPERIENCE_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner',
    description:
      'New to cycling or returning after a long break. Focus on building basic fitness and getting comfortable on the bike.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description:
      'Regular cyclist with some training experience. Ready for structured workouts and performance improvement.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description:
      'Experienced cyclist with structured training. Looking for advanced techniques and race-specific preparation.',
  },
];

const BASE_STEPS = 3; // Personal info, HR zones, Experience level

/**
 * Which extra step (if any) the wizard needs, based on how the user signed
 * up — a Strava-only account has no email yet (step 4 collects one); an
 * email-only account hasn't connected Strava (step 4 offers to).
 */
export function getAuthType(profile) {
  if (!profile) return null;
  const hasStrava = !!profile.strava_id;
  const hasEmail = !!profile.email;
  if (hasStrava && hasEmail) return 'both';
  if (hasStrava && !hasEmail) return 'strava';
  if (!hasStrava && hasEmail) return 'email';
  return null;
}

export function getTotalSteps(authType) {
  return authType === 'strava' || authType === 'email' ? BASE_STEPS + 1 : BASE_STEPS;
}

/** Per-step field validation — mirrors the server's own range checks (T-4.x OnboardingBodySchema). */
export function validateStep(step, formData, authType) {
  const errors = {};

  switch (step) {
    case 1:
      if (formData.height && (formData.height < 100 || formData.height > 250)) {
        errors.height = 'Height must be between 100 and 250 cm';
      }
      if (formData.weight && (formData.weight < 30 || formData.weight > 200)) {
        errors.weight = 'Weight must be between 30 and 200 kg';
      }
      if (formData.birth_date) {
        const age = ageFromBirthDate(formData.birth_date);
        if (age == null || age < 10 || age > 100) {
          errors.birth_date = 'Please enter a valid date of birth (age 10-100)';
        }
      }
      if (formData.bike_weight && (formData.bike_weight < 5 || formData.bike_weight > 25)) {
        errors.bike_weight = 'Bike weight must be between 5 and 25 kg';
      }
      if (formData.gender && !['male', 'female', 'other'].includes(formData.gender)) {
        errors.gender = 'Please select a valid gender';
      }
      break;
    case 2:
      if (formData.max_hr && (formData.max_hr < 100 || formData.max_hr > 220)) {
        errors.max_hr = 'Max HR must be between 100 and 220 bpm';
      }
      if (formData.resting_hr && (formData.resting_hr < 40 || formData.resting_hr > 100)) {
        errors.resting_hr = 'Resting HR must be between 40 and 100 bpm';
      }
      if (formData.lactate_threshold && (formData.lactate_threshold < 120 || formData.lactate_threshold > 200)) {
        errors.lactate_threshold = 'Lactate Threshold must be between 120 and 200 bpm';
      }
      break;
    case 3:
      // Experience level always has a default value.
      break;
    case 4:
      if (authType === 'strava' && (!formData.email || !formData.email.includes('@'))) {
        errors.email = 'Please enter a valid email address';
      }
      break;
    default:
      break;
  }

  return errors;
}

/**
 * Builds the POST /api/user-profile/onboarding body: drops empty fields
 * and `email`/`hr_zones` — `hr_zones` is server-derived (T-3.1, never
 * accepted from a client) and `email` goes through its own dedicated
 * POST /api/user-profile/email flow instead (it mints a fresh token).
 */
export function buildOnboardingPayload(formData) {
  return Object.fromEntries(
    Object.entries(formData).filter(([key, value]) => value !== '' && key !== 'email' && key !== 'hr_zones'),
  );
}
