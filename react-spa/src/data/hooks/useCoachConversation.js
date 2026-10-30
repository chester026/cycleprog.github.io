import { useQuery } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryKeys } from '../keys';

/**
 * Query descriptor for one conversation's detail, shared by the hook below
 * and `fetchCoachConversation` so the imperative open (a click, not a
 * render) and any declarative reader hit the same cache entry.
 */
export function coachConversationQuery(id) {
  return {
    queryKey: queryKeys.coachConversation(id),
    queryFn: () => call(coach.conversationDetail, { params: { id } }),
  };
}

/** GET /api/coach/conversations/:id — `{conversation, messages}`. */
export function useCoachConversation(id) {
  return useQuery({
    ...coachConversationQuery(id ?? ''),
    enabled: Boolean(id),
  });
}

/**
 * Imperative counterpart used by useCoachChat.openConversation: the chat
 * loads a transcript when the route changes, not while rendering a
 * component that reads it.
 */
export function fetchCoachConversation(queryClient, id) {
  return queryClient.fetchQuery(coachConversationQuery(id));
}
