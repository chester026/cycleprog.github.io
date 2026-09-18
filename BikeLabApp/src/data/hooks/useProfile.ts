import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {UserProfile} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/**
 * GET /api/user-profile (T-5.1, A-17/A-34 — 13 independent places used to
 * load this). Every screen that needs the profile now shares this one
 * query/cache entry instead of its own `useState` + fetch.
 */
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch('/api/user-profile') as Promise<UserProfile>,
  });
}
