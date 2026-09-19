import {useMutation} from '@tanstack/react-query';
import {api, metaGoals} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export type UpdateMetaGoalInput = {
  id: string | number;
  body: {status?: 'active' | 'completed'};
};

/**
 * PUT /api/meta-goals/:id — GoalDetailsScreen's "mark as complete" action.
 * Distinct from useSaveGoal (which is PUT /api/goals/:id, a *sub*-goal) —
 * this mutates the meta-goal row itself.
 */
export function useUpdateMetaGoal() {
  return useMutation({
    mutationFn: ({id, body}: UpdateMetaGoalInput) =>
      api.call(metaGoals.update, {params: {id: Number(id)}, body}),
    onSuccess: (_data, {id}) => {
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoalDetail(id)});
    },
  });
}
