import { useMutation } from '@tanstack/react-query';
import { call, metaGoals } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * PUT /api/meta-goals/:id — GoalDetailPage's edit form, "mark as complete"
 * and MetaGoalRow's inline status toggle all share this one mutation.
 */
export function useSaveMetaGoal() {
  return useMutation({
    mutationFn: ({ id, body }) => call(metaGoals.update, { params: { id }, body }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoal(id) });
    },
  });
}
