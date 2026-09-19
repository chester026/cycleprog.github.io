import {useMutation} from '@tanstack/react-query';
import {api, goals} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** DELETE /api/goals/:id. */
export function useDeleteGoal() {
  return useMutation({
    mutationFn: (id: string | number) => api.call(goals.remove, {params: {id: Number(id)}}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.goals});
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
    },
  });
}
