import { useQuery } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryKeys } from '../keys';

/**
 * Query descriptor for GET /api/coach/conversations/by-activity/:activityId
 * (`null` when the rider hasn't discussed that ride yet). The coach page's
 * `?activity=` entry point resolves it imperatively via `fetchQuery`.
 */
export function conversationByActivityQuery(activityId) {
  return {
    queryKey: queryKeys.coachConversationByActivity(activityId),
    queryFn: () => call(coach.conversationByActivity, { params: { activityId } }),
    // A fresh chat about this ride can start at any moment; never serve an
    // old "no conversation yet" answer for the next click.
    staleTime: 0,
  };
}

/** Declarative form for a page that wants to show "Open chat" vs "Discuss with coach". */
export function useConversationByActivity(activityId) {
  return useQuery({
    ...conversationByActivityQuery(activityId ?? 0),
    enabled: activityId !== null && activityId !== undefined,
  });
}
