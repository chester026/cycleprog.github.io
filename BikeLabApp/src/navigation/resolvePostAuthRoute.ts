// Pure function — where a rider lands right after they get a session token,
// whether that's from LoginScreen's email form, App.tsx's cold-start token
// check, or deepLinks.ts's Strava/`bikelab://auth` exchange. All three call
// sites used to duplicate `profile.onboarding_completed ? 'Main' :
// 'Onboarding'` inline (T-5.2).
export interface PostAuthProfile {
  onboarding_completed?: boolean | null;
}

export type PostAuthRoute = 'Main' | 'Onboarding';

// Only an explicit `false` sends the rider to Onboarding — a missing/null
// value (a degraded profile fetch, not a fresh signup) defaults to Main
// rather than re-onboarding someone who already has an account.
export function resolvePostAuthRoute(
  profile: PostAuthProfile | null | undefined,
): PostAuthRoute {
  return profile?.onboarding_completed === false ? 'Onboarding' : 'Main';
}
