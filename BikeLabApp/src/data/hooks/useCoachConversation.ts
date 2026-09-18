import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {CoachConversationDetail} from '../../types/coach';
import {queryKeys} from '../keys';

export interface UseCoachConversationOptions {
  /** Passed to GET /api/coach/conversations/:id?limit=; server default/max apply when omitted. */
  limit?: number;
  enabled?: boolean;
}

/**
 * Query descriptor for one coach conversation's detail — exported (not just
 * the hook) so `useCoachChat.openConversation` can `queryClient.fetchQuery`
 * the exact same key/fn imperatively (opening a conversation happens on a
 * button tap, not at render time, so the declarative hook below isn't a fit
 * for that call site — see useCoachChat.ts).
 */
export function coachConversationQuery(id: string, limit?: number) {
  return {
    queryKey: queryKeys.coachConversation(id, limit),
    queryFn: () =>
      apiFetch(`/api/coach/conversations/${id}${limit ? `?limit=${limit}` : ''}`) as Promise<CoachConversationDetail>,
  };
}

/** GET /api/coach/conversations/:id?limit= — one conversation + its messages. */
export function useCoachConversation(id: string | null, opts: UseCoachConversationOptions = {}) {
  return useQuery({
    ...coachConversationQuery(id ?? '', opts.limit),
    enabled: !!id && opts.enabled !== false,
  } satisfies UseQueryOptions<CoachConversationDetail>);
}
