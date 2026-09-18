import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * POST /api/goals (create) or PUT /api/goals/:id (update) — invalidates
 * goals + every meta-goal (a sub-goal save changes its parent's
 * sub_goals/progress too).
 */
export function useSaveGoal() {
  return useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(id ? `/api/goals/${id}` : '/api/goals', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals });
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
