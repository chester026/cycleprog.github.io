import { describe, it, expect } from 'vitest';
import { userProfile } from './userProfile.js';

describe('userProfile contract', () => {
  it('get: accepts a fresh-user default profile merged with user fields + derived hr_zones', () => {
    const r = userProfile.get.response.safeParse({
      id: 1,
      name: null,
      avatar: null,
      strava_id: null,
      email: 'rider@example.com',
      is_admin: false,
      experience_level: 'intermediate',
      time_available: 5,
      hr_zones: {
        method: 'maxhr',
        basis: { max_hr: 190 },
        zones: [{ id: 1, key: 'z1', nameKey: 'zone.recovery', name: 'Recovery', min: 0, max: 114, color: '#000' }],
      },
    });
    expect(r.success).toBe(true);
  });

  it('update: accepts a partial PUT body (a single settings-screen field)', () => {
    expect(userProfile.update.body.safeParse({ height: 180, weight: 75 }).success).toBe(true);
    // hr_zones is derived-only — the schema doesn't even describe it as an
    // accepted key, but `.passthrough()` means a stray client value is
    // still accepted here (and stripped server-side) rather than rejected.
    expect(userProfile.update.body.safeParse({ hr_zones: { bogus: true } }).success).toBe(true);
  });

  it('onboarding: accepts both the skip shape and the full payload', () => {
    expect(userProfile.onboarding.body.safeParse({ onboarding_completed: true }).success).toBe(true);
    expect(
      userProfile.onboarding.body.safeParse({
        experience_level: 'advanced',
        height: 182,
        weight: 78,
        age: 28,
        max_hr: 195,
        onboarding_completed: true,
      }).success
    ).toBe(true);
  });

  it('changeEmail: response requires success/message/token; body is tolerant of a missing/invalid email', () => {
    expect(
      userProfile.changeEmail.response.safeParse({
        success: true,
        message: 'Email updated. Please check your inbox to verify your new address.',
        token: 'jwt',
      }).success
    ).toBe(true);
    expect(userProfile.changeEmail.body.safeParse({}).success).toBe(true);
    expect(userProfile.changeEmail.body.safeParse({ email: 'not-an-email' }).success).toBe(true);
  });
});
