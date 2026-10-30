import { describe, it, expect } from 'vitest';
import { shouldDehydrateQuery, QUERY_PERSIST_BUSTER } from '../queryClient';
import { queryKeys } from '../keys';

const successQuery = (queryKey) => ({ queryKey, state: { status: 'success' } });

describe('queryClient persister filter', () => {
  it('persists ordinary successful queries', () => {
    expect(shouldDehydrateQuery(successQuery(queryKeys.activities()))).toBe(true);
    expect(shouldDehydrateQuery(successQuery(queryKeys.coachNotes))).toBe(true);
  });

  it('keeps every coach-conversation key and the admin keys out of localStorage', () => {
    expect(shouldDehydrateQuery(successQuery(queryKeys.coachConversations))).toBe(false);
    expect(shouldDehydrateQuery(successQuery(queryKeys.coachConversation('abc')))).toBe(false);
    expect(shouldDehydrateQuery(successQuery(queryKeys.coachConversationByActivity(7)))).toBe(false);
    expect(shouldDehydrateQuery(successQuery(queryKeys.adminUsers))).toBe(false);
    expect(shouldDehydrateQuery(successQuery(queryKeys.adminAiUsage(7)))).toBe(false);
  });

  it('never persists a pending or errored query', () => {
    expect(shouldDehydrateQuery({ queryKey: ['goals'], state: { status: 'pending' } })).toBe(false);
    expect(shouldDehydrateQuery({ queryKey: ['goals'], state: { status: 'error' } })).toBe(false);
  });

  it('uses the build hash injected by Vite as the buster', () => {
    expect(QUERY_PERSIST_BUSTER).toBe('test');
  });
});
