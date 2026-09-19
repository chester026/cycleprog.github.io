import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {api, activities} from '../api';
import type {Activity} from '../../types/activity';
import {queryKeys} from '../keys';

export interface UseActivitiesOptions {
  /** Passed through to TanStack's `enabled` — skip the fetch (e.g. while logged out). */
  enabled?: boolean;
}

/**
 * GET /api/activities (T-5.1, A-17 — 11 places used to load this
 * independently). The contract's response schema (`activities.list`) is
 * kept loose on purpose (see packages/shared/src/api/contract/activities.ts
 * — the route passes Strava/DB rows straight through), so the cast to the
 * app's richer `Activity[]` type here is unchanged from the old
 * `apiFetch(...) as Promise<Activity[]>` — no behaviour change, just the
 * request now goes through the typed contract.
 */
export function useActivities(opts: UseActivitiesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.activities(),
    queryFn: () => api.call(activities.list) as Promise<Activity[]>,
    enabled: opts.enabled,
  } satisfies UseQueryOptions<Activity[]>);
}
