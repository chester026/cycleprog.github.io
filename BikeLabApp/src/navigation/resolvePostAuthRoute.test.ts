import {resolvePostAuthRoute} from './resolvePostAuthRoute';

describe('resolvePostAuthRoute', () => {
  it('sends a profile with onboarding_completed === false to Onboarding', () => {
    expect(resolvePostAuthRoute({onboarding_completed: false})).toBe('Onboarding');
  });

  it('sends a profile with onboarding_completed === true to Main', () => {
    expect(resolvePostAuthRoute({onboarding_completed: true})).toBe('Main');
  });

  it('defaults to Main when onboarding status is missing or the profile fetch failed', () => {
    expect(resolvePostAuthRoute({})).toBe('Main');
    expect(resolvePostAuthRoute({onboarding_completed: null})).toBe('Main');
    expect(resolvePostAuthRoute(null)).toBe('Main');
    expect(resolvePostAuthRoute(undefined)).toBe('Main');
  });
});
