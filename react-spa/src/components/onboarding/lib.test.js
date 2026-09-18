import { describe, it, expect } from 'vitest';
import { getAuthType, getTotalSteps, validateStep, buildOnboardingPayload, INITIAL_FORM_DATA } from './lib';

describe('getAuthType', () => {
  it('returns null when there is no profile yet', () => {
    expect(getAuthType(null)).toBeNull();
  });

  it('returns "both" when the profile has both strava and email', () => {
    expect(getAuthType({ strava_id: 1, email: 'a@b.com' })).toBe('both');
  });

  it('returns "strava" for a strava-only account (no email on file)', () => {
    expect(getAuthType({ strava_id: 1, email: null })).toBe('strava');
  });

  it('returns "email" for an email-only account (no strava linked)', () => {
    expect(getAuthType({ strava_id: null, email: 'a@b.com' })).toBe('email');
  });

  it('returns null when neither is set', () => {
    expect(getAuthType({ strava_id: null, email: null })).toBeNull();
  });
});

describe('getTotalSteps', () => {
  it('is 3 for "both" or unknown auth types', () => {
    expect(getTotalSteps('both')).toBe(3);
    expect(getTotalSteps(null)).toBe(3);
  });

  it('is 4 for a strava-only or email-only account (extra step 4)', () => {
    expect(getTotalSteps('strava')).toBe(4);
    expect(getTotalSteps('email')).toBe(4);
  });
});

describe('validateStep', () => {
  it('flags an out-of-range height/weight/age/bike_weight/gender on step 1', () => {
    const errors = validateStep(1, { ...INITIAL_FORM_DATA, height: 500, weight: 1, age: 5, bike_weight: 1, gender: 'x' });
    expect(errors.height).toBeTruthy();
    expect(errors.weight).toBeTruthy();
    expect(errors.age).toBeTruthy();
    expect(errors.bike_weight).toBeTruthy();
    expect(errors.gender).toBeTruthy();
  });

  it('passes step 1 with empty/valid fields', () => {
    expect(validateStep(1, INITIAL_FORM_DATA)).toEqual({});
  });

  it('flags out-of-range HR fields on step 2', () => {
    const errors = validateStep(2, { ...INITIAL_FORM_DATA, max_hr: 5, resting_hr: 5, lactate_threshold: 5 });
    expect(errors.max_hr).toBeTruthy();
    expect(errors.resting_hr).toBeTruthy();
    expect(errors.lactate_threshold).toBeTruthy();
  });

  it('never flags step 3 (experience level always has a default)', () => {
    expect(validateStep(3, INITIAL_FORM_DATA)).toEqual({});
  });

  it('requires a valid email on step 4 only for strava-only accounts', () => {
    expect(validateStep(4, INITIAL_FORM_DATA, 'strava').email).toBeTruthy();
    expect(validateStep(4, { ...INITIAL_FORM_DATA, email: 'not-an-email' }, 'strava').email).toBeTruthy();
    expect(validateStep(4, { ...INITIAL_FORM_DATA, email: 'a@b.com' }, 'strava')).toEqual({});
    expect(validateStep(4, INITIAL_FORM_DATA, 'email')).toEqual({});
  });
});

describe('buildOnboardingPayload', () => {
  it('drops empty-string fields', () => {
    expect(buildOnboardingPayload(INITIAL_FORM_DATA)).toEqual({ experience_level: 'intermediate' });
  });

  it('keeps filled-in fields, and always drops email and hr_zones', () => {
    const payload = buildOnboardingPayload({
      ...INITIAL_FORM_DATA,
      height: '180',
      email: 'a@b.com',
      hr_zones: { method: 'bogus' },
    });
    expect(payload.height).toBe('180');
    expect(payload.email).toBeUndefined();
    expect(payload.hr_zones).toBeUndefined();
  });
});
