import {useMutation} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** DELETE /api/goals/:id. */
export function useDeleteGoal() {
  return useMutation({
    mutationFn: (id: string | number) => apiFetch(`/api/goals/${id}`, {method: 'DELETE'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.goals});
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
    },
  });
}
