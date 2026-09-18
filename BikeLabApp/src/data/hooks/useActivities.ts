import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {Activity} from '../../types/activity';
import {queryKeys} from '../keys';

export interface UseActivitiesOptions {
  /** Passed through to TanStack's `enabled` — skip the fetch (e.g. while logged out). */
  enabled?: boolean;
}

/** GET /api/activities (T-5.1, A-17 — 11 places used to load this independently). */
export function useActivities(opts: UseActivitiesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.activities(),
    queryFn: () => apiFetch('/api/activities') as Promise<Activity[]>,
    enabled: opts.enabled,
  } satisfies UseQueryOptions<Activity[]>);
}
