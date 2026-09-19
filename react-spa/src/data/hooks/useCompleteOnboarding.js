import { useMutation } from '@tanstack/react-query';
import { call, userProfile } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * POST /api/user-profile/onboarding — OnboardingModal's wizard submit and
 * "Skip for now" (T-6.3 decomposition, previously a page-local apiFetch
 * call in OnboardingModal.jsx). Server always re-derives `hr_zones`
 * (T-3.1) — the returned profile is written straight into the shared
 * `useProfile()` cache entry.
 */
export function useCompleteOnboarding() {
  return useMutation({
    mutationFn: (body) => call(userProfile.onboarding, { body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
