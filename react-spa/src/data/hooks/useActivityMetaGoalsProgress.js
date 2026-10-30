import { useQuery } from '@tanstack/react-query';
import { call, activities } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/activities/:id/meta-goals-progress — what this ride contributed
 * to each active meta goal (`{id, title, tier, progress, progressGain,
 * contributions[]}`). The server persists its answer per meta goal, so the
 * client keeps the default staleTime: a one-off empty answer must not stick.
 */
export function useActivityMetaGoalsProgress(activityId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.activityMetaGoalsProgress(activityId ?? ''),
    queryFn: () => call(activities.metaGoalsProgress, { params: { id: Number(activityId) } }),
    enabled: enabled && activityId != null,
  });
}
