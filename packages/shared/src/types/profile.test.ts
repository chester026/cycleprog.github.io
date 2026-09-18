import { describe, expect, it } from 'vitest';
import {
  UserProfileSchema,
  UserProfileUpdateSchema,
  OnboardingBodySchema,
} from './profile.js';

describe('UserProfileSchema', () => {
  it('parses a realistic GET /api/user-profile response', () => {
    const profile = {
      id: 42,
      name: 'Dmitry',
      avatar: null,
      strava_id: '9988776',
      email: 'd.krikunov@mu.se',
      is_admin: false,
      experience_level: 'intermediate',
      time_available: 5,
      workouts_per_week: 5,
      show_recommendations: true,
      preferred_training_types: ['endurance', 'tempo'],
      preferred_days: ['monday', 'wednesday', 'friday'],
      seasonal_preferences: {},
      height: 180,
      weight: 75,
      age: 34,
      bike_weight: 8.2,
      hr_zones: {
        method: 'karvonen',
        basis: { max_hr: 190, resting_hr: 55 },
        zones: [
          { id: 1, key: 'z1', nameKey: 'zones.z1', name: 'Recovery', min: 100, max: 120, color: '#22c55e' },
        ],
      },
      max_hr: 190,
      resting_hr: 55,
      lactate_threshold: 165,
      gender: 'male',
      onboarding_completed: true,
    };
    const parsed = UserProfileSchema.parse(profile);
    expect(parsed.max_hr).toBe(190);
    expect(parsed.resting_hr).toBe(55);
    expect(parsed.lactate_threshold).toBe(165);
    expect(parsed.hr_zones?.method).toBe('karvonen');
  });

  it('accepts a null hr_zones (not enough profile data to derive zones)', () => {
    const parsed = UserProfileSchema.parse({ hr_zones: null });
    expect(parsed.hr_zones).toBeNull();
  });

  it('coerces stringified numeric fields (NUMERIC columns / form inputs)', () => {
    const parsed = UserProfileSchema.parse({ max_hr: '190', weight: '75.5' });
    expect(parsed.max_hr).toBe(190);
    expect(parsed.weight).toBe(75.5);
  });

  it('rejects a non-numeric max_hr', () => {
    const result = UserProfileSchema.safeParse({ max_hr: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('UserProfileUpdateSchema', () => {
  it('accepts a mobile partial update (single settings screen)', () => {
    const parsed = UserProfileUpdateSchema.parse({ max_hr: 188, resting_hr: 52 });
    expect(parsed.max_hr).toBe(188);
  });

  it('is not affected by a client-sent hr_zones (derived-only field, T-3.1)', () => {
    // hr_zones is omitted from the schema's own shape; the route handler
    // (server.js) is what actually strips it from the body before it
    // reaches updateUserProfile — this just confirms the schema no longer
    // *validates* it as a client-writable field.
    const parsed = UserProfileUpdateSchema.parse({
      experience_level: 'advanced',
      height: 178,
      weight: 72,
    });
    expect(parsed.experience_level).toBe('advanced');
  });

  it('rejects a garbage type for max_hr', () => {
    const result = UserProfileUpdateSchema.safeParse({ max_hr: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('OnboardingBodySchema', () => {
  it('accepts the skip-only shape', () => {
    const parsed = OnboardingBodySchema.parse({ onboarding_completed: true });
    expect(parsed.onboarding_completed).toBe(true);
  });

  it('accepts a full onboarding payload', () => {
    const parsed = OnboardingBodySchema.parse({
      height: 180,
      weight: 75,
      age: 30,
      bike_weight: 8,
      experience_level: 'beginner',
      gender: 'female',
      max_hr: 190,
      resting_hr: 60,
      lactate_threshold: 160,
      onboarding_completed: true,
    });
    expect(parsed.experience_level).toBe('beginner');
  });

  it('rejects a non-numeric age', () => {
    const result = OnboardingBodySchema.safeParse({ age: 'thirty' });
    expect(result.success).toBe(false);
  });
});
