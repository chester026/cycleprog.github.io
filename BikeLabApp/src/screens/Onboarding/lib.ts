// Pure helpers extracted from OnboardingScreen.tsx (T-5.2 decomposition —
// keeps the screen file itself under the 600-line guideline). No React,
// no I/O — safe to unit test directly.

export interface OnboardingFormData {
  height: string;
  weight: string;
  age: string;
  gender: string;
  bike_weight: string;
  max_hr: string;
  resting_hr: string;
  lactate_threshold: string;
  experience_level: string;
}

export const TOTAL_STEPS = 3;

export const INITIAL_FORM_DATA: OnboardingFormData = {
  height: '',
  weight: '',
  age: '',
  gender: '',
  bike_weight: '',
  max_hr: '',
  resting_hr: '',
  lactate_threshold: '',
  experience_level: 'intermediate',
};

export const EXPERIENCE_LEVEL_KEYS = [
  {value: 'beginner', labelKey: 'onboarding.beginner', descKey: 'onboarding.beginnerDesc'},
  {value: 'intermediate', labelKey: 'onboarding.intermediate', descKey: 'onboarding.intermediateDesc'},
  {value: 'advanced', labelKey: 'onboarding.advanced', descKey: 'onboarding.advancedDesc'},
];

/**
 * Rough resting-HR estimate used only as a fallback for the wizard's live
 * HR-zones preview when the rider hasn't entered one yet — the saved value
 * (once they submit) is computed server-side from whatever they actually
 * entered.
 */
export function estimateRestingHrFromExperience(experienceLevel?: string): number {
  switch (experienceLevel) {
    case 'beginner':
      return 75;
    case 'intermediate':
      return 65;
    case 'advanced':
      return 55;
    default:
      return 70;
  }
}

/** Builds the POST /api/user-profile/onboarding body from the wizard's raw string inputs. */
export function buildProfileData(formData: OnboardingFormData): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (formData.height) data.height = parseInt(formData.height, 10);
  if (formData.weight) data.weight = parseFloat(formData.weight);
  if (formData.age) data.age = parseInt(formData.age, 10);
  if (formData.gender) data.gender = formData.gender;
  if (formData.bike_weight) data.bike_weight = parseFloat(formData.bike_weight);
  if (formData.max_hr) data.max_hr = parseInt(formData.max_hr, 10);
  if (formData.resting_hr) data.resting_hr = parseInt(formData.resting_hr, 10);
  if (formData.lactate_threshold) data.lactate_threshold = parseInt(formData.lactate_threshold, 10);
  data.experience_level = formData.experience_level;

  return data;
}
