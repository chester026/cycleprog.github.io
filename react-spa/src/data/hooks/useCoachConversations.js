import { useQuery } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryKeys } from '../keys';

/** GET /api/coach/conversations — the coach home's "Recent chats" list. */
export function useCoachConversations() {
  return useQuery({
    queryKey: queryKeys.coachConversations,
    queryFn: () => call(coach.conversations),
  });
}
