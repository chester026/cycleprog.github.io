import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryKeys} from '../keys';

export interface ActivityAiAnalysisResponse {
  analysis: string;
}

export interface UseActivityAiAnalysisOptions {
  /** Callers should only fetch this on demand (it burns the user's AI
   * budget — `requireAiBudget` server-side) rather than on mount, so
   * `enabled` defaults to `false` here, unlike the other hooks in this
   * folder. */
  enabled?: boolean;
}

/**
 * GET /api/activities/:id/ai-analysis (T-5.1). Same endpoint
 * `AIAnalysisModal.tsx` already calls directly via `apiFetch` — this hook
 * is the `src/data/hooks/*` equivalent, added for RideAnalyticsScreen's
 * data-layer migration. Not wired into any screen's UI yet (see the
 * wave's final report); `AIAnalysisModal.tsx` (used by ActivitiesScreen/
 * GarageScreen, outside this task's ownership) is unchanged.
 */
export function useActivityAiAnalysis(
  activityId: number | string | undefined,
  opts: UseActivityAiAnalysisOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.activityAiAnalysis(activityId ?? ''),
    queryFn: () =>
      apiFetch(`/api/activities/${activityId}/ai-analysis`) as Promise<ActivityAiAnalysisResponse>,
    enabled: (opts.enabled ?? false) && activityId != null,
    retry: false,
  } satisfies UseQueryOptions<ActivityAiAnalysisResponse>);
}
