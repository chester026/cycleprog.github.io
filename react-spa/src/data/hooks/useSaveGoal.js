import { useMutation } from '@tanstack/react-query';
import { call, goals } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * POST /api/goals (create) or PUT /api/goals/:id (update) — invalidates
 * goals + every meta-goal (a sub-goal save changes its parent's
 * sub_goals/progress too).
 */
export function useSaveGoal() {
  return useMutation({
    mutationFn: ({ id, body }) => (id ? call(goals.update, { params: { id }, body }) : call(goals.create, { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals });
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
