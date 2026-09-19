import {useQuery} from '@tanstack/react-query';
import {api, activities} from '../api';
import type {EndpointResponse} from '../api';
import {queryKeys} from '../keys';

// GET /api/activities/:id/meta-goals-progress response — now the contract's
// `activities.metaGoalsProgress.response` element type (packages/shared/src/
// api/contract/activities.ts, derived from server/services/activities.js's
// getMetaGoalsProgressForActivity).
export type ActivityMetaGoalProgress = EndpointResponse<typeof activities.metaGoalsProgress>[number];

/**
 * GET /api/activities/:id/meta-goals-progress (T-5.1). The server itself
 * checks its DB before recomputing (only the last-viewed activity per meta
 * goal is stored — see the route's own comment), so the 7-day client cache
 * RideAnalyticsScreen used to keep through `utils/cache.ts`'s `Cache.get`/
 * `Cache.set` is now just this query's `staleTime` — same effective
 * lifetime, no separate cache/no AsyncStorage.
 */
export function useActivityMetaGoalsProgress(activityId: number | string | undefined) {
  return useQuery({
    queryKey: queryKeys.activityMetaGoalsProgress(activityId ?? ''),
    queryFn: () => api.call(activities.metaGoalsProgress, {params: {id: Number(activityId)}}),
    enabled: activityId != null,
    // No week-long staleTime here (the old Cache.set(..., CACHE_TTL.WEEK)
    // had it): the server already persists this per meta-goal in
    // activity_meta_goals_progress, and with the query cache persisted to
    // disk a one-off empty answer would otherwise stick for 7 days and the
    // screen would never ask again ("No active goals found" forever).
    staleTime: 0,
  });
}
