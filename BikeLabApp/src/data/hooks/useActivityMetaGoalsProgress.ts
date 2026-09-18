import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryKeys} from '../keys';

// GET /api/activities/:id/meta-goals-progress response (server/services/
// activities.js's getMetaGoalsProgressForActivity) — no shared zod schema
// yet, typed by hand from what RideAnalyticsScreen actually reads off it.
export interface ActivityMetaGoalProgress {
  id: string | number;
  title: string;
  progress: number;
  progressGain?: number;
  contributions?: {label: string; value: string | number}[];
  [key: string]: unknown;
}

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
    queryFn: () =>
      apiFetch(`/api/activities/${activityId}/meta-goals-progress`).then(
        res => (res ?? []) as ActivityMetaGoalProgress[],
      ),
    enabled: activityId != null,
    // No week-long staleTime here (the old Cache.set(..., CACHE_TTL.WEEK)
    // had it): the server already persists this per meta-goal in
    // activity_meta_goals_progress, and with the query cache persisted to
    // disk a one-off empty answer would otherwise stick for 7 days and the
    // screen would never ask again ("No active goals found" forever).
    staleTime: 0,
  });
}
