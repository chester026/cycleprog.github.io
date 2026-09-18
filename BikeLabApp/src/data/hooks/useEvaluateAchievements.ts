import {useMutation} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export interface EvaluateAchievementsResult {
  newly_unlocked?: Array<{
    name: string;
    icon: string;
    tier: string;
    description: string;
  }>;
}

/**
 * POST /api/achievements/evaluate — used by AchievementsScreen's
 * pull-to-refresh (T-5.1/A-34: automatic evaluation now runs server-side on
 * new activities; this is only the deliberate user-triggered re-evaluation).
 * Invalidates useAchievements() so the screen's list/stats reflect any
 * newly-unlocked achievements without a manual refetch call.
 */
export function useEvaluateAchievements() {
  return useMutation({
    mutationFn: () => apiFetch('/api/achievements/evaluate', {method: 'POST'}) as Promise<EvaluateAchievementsResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.achievements});
    },
  });
}
