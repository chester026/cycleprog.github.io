import { useMutation } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** PATCH /api/coach/conversations/:id {title} — inline rename in the recent-chats list. */
export function useRenameConversation() {
  return useMutation({
    mutationFn: ({ id, title }) => call(coach.renameConversation, { params: { id }, body: { title } }),
    onSuccess: (updated, { id }) => {
      queryClient.setQueryData(queryKeys.coachConversations, (list) =>
        (list ?? []).map((conversation) =>
          conversation.id === id ? { ...conversation, title: updated.title } : conversation,
        ),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.coachConversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.coachConversation(id) });
    },
  });
}
