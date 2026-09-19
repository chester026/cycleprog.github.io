import { useQuery } from '@tanstack/react-query';
import { call, activities } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/activities — full list, no `limit`/pagination yet (a later
 * task). Fixes the stale "10 Wind Adjusted" bug (W-18): every page reading
 * this hook shares one cache entry instead of its own localStorage TTL copy,
 * so a mutation elsewhere (a new ride, a deleted ride) invalidates all of
 * them together instead of leaving some pages showing an old snapshot.
 */
export function useActivities(opts = {}) {
  return useQuery({
    queryKey: queryKeys.activities(),
    queryFn: () => call(activities.list),
    enabled: opts.enabled,
  });
}
