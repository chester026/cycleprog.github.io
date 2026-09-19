import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {api, coach} from '../api';
import type {ConversationSummary} from '../../types/coach';
import {queryKeys} from '../keys';

export interface UseCoachConversationsOptions {
  /** Passed through to TanStack's `enabled` — skip the fetch (e.g. while logged out). */
  enabled?: boolean;
}

/**
 * GET /api/coach/conversations — the AI Coach's "recent chats" list
 * (T-5.x wave 2, replaces useCoachChat's own apiFetch+useState).
 */
export function useCoachConversations(opts: UseCoachConversationsOptions = {}) {
  return useQuery({
    queryKey: queryKeys.coachConversations,
    queryFn: () => api.call(coach.conversations) as Promise<ConversationSummary[]>,
    enabled: opts.enabled,
  } satisfies UseQueryOptions<ConversationSummary[]>);
}
