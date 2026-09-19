import { useMutation } from '@tanstack/react-query';
import { call, userProfile } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * POST /api/user-profile/email — OnboardingModal's Strava-user email step
 * and ProfilePage's Account Settings tab (T-4.5/S-27 hardened endpoint:
 * normalises/validates the address, 409s with `code: 'EMAIL_TAKEN'` on
 * conflict instead of a bare 400, and re-sends a verification email).
 * Response is `{ success, message, token }` — `token` is a fresh JWT (the
 * email just changed) and must be handed to `useAuth().login({ token })`
 * by the caller; this hook only knows about the query cache, not auth.
 */
export function useChangeEmail() {
  return useMutation({
    mutationFn: (email) => call(userProfile.changeEmail, { body: { email } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
