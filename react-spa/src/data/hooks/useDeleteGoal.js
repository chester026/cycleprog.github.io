import { useMutation } from '@tanstack/react-query';
import { call, goals } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** DELETE /api/goals/:id. */
export function useDeleteGoal() {
  return useMutation({
    mutationFn: (id) => call(goals.remove, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals });
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
