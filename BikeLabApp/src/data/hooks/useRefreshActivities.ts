import {useCallback} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {api, activities} from '../api';
import {logger} from '../../lib/logger';

/**
 * Drops the server's activities cache, then invalidates every client query
 * derived from it, so pull-to-refresh actually surfaces a ride the rider
 * has just finished.
 *
 * Without the first half this is a no-op for fresh data: the server holds a
 * user's activities in a 2-hour cache (services/strava/activities.js) and
 * only tops up from Strava on a cache miss, and there is no Strava webhook.
 * A plain refetch therefore re-read the same stale set — and since goal
 * progress is recomputed from that set on every read, goals stayed frozen
 * with it until the TTL expired.
 *
 * Best-effort: if the clear call fails (offline, rate limit), the refresh
 * still runs against whatever the server already has.
 */
export function useRefreshActivities() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await api.call(activities.cacheClear);
    } catch (err) {
      logger.debug('activities cache clear failed, refreshing anyway', err);
    }
    await queryClient.invalidateQueries();
  }, [queryClient]);
}
