import { useMutation } from '@tanstack/react-query';
import { call, metaGoals } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** DELETE /api/meta-goals/:id — deletes the meta-goal and its sub-goals. */
export function useDeleteMetaGoal() {
  return useMutation({
    mutationFn: (id) => call(metaGoals.remove, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
