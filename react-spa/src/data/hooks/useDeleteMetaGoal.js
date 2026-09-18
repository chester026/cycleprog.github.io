import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** DELETE /api/meta-goals/:id — deletes the meta-goal and its sub-goals. */
export function useDeleteMetaGoal() {
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/meta-goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
