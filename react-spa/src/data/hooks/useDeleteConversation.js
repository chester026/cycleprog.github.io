import { useMutation } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * DELETE /api/coach/conversations/:id — optimistic: the row leaves the list
 * immediately; a failure restores the previous list and the server state is
 * re-read either way.
 */
export function useDeleteConversation() {
  return useMutation({
    mutationFn: (id) => call(coach.deleteConversation, { params: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.coachConversations });
      const previous = queryClient.getQueryData(queryKeys.coachConversations);
      queryClient.setQueryData(queryKeys.coachConversations, (list) =>
        (list ?? []).filter((conversation) => conversation.id !== id),
      );
      queryClient.removeQueries({ queryKey: queryKeys.coachConversation(id) });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.coachConversations, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coachConversations });
    },
  });
}
