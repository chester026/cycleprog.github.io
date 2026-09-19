import {useMutation} from '@tanstack/react-query';
import {api, metaGoals} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/**
 * DELETE /api/meta-goals/:id. Distinct from useDeleteGoal (DELETE
 * /api/goals/:id, a *sub*-goal) — this deletes the meta-goal (and its
 * sub-goals, server-side) as a whole, which is what GoalDetailsScreen's
 * trash icon does.
 */
export function useDeleteMetaGoal() {
  return useMutation({
    mutationFn: (id: string | number) => api.call(metaGoals.remove, {params: {id: Number(id)}}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
    },
  });
}
