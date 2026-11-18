import {useQuery} from '@tanstack/react-query';
import {api, identity} from '../api';
import {queryKeys} from '../keys';

/**
 * GET /api/auth/providers — which sign-in providers the server is configured
 * for. LoginScreen shows a provider's button only once this says so: a
 * button the server would answer 503 to is worse than no button.
 */
export function useAuthProviders() {
  return useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: () => api.call(identity.providers),
    staleTime: 5 * 60 * 1000,
  });
}
