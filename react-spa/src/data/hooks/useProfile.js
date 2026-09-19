import { useQuery } from '@tanstack/react-query';
import { call, userProfile } from '../api';
import { queryKeys } from '../keys';
import { useAuth } from '../../auth/AuthProvider';

/** GET /api/user-profile — shared by every page that used to load it independently. */
export function useProfile() {
  // Components like OnboardingModal are mounted app-wide (also on the
  // landing/login pages). Without this gate they'd fire an unauthenticated
  // GET /api/user-profile → 401 → "session expired" redirect to /login for a
  // visitor who never had a session.
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => call(userProfile.get),
    enabled: isAuthenticated,
  });
}
