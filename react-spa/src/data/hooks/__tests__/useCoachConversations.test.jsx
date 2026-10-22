import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCoachConversations } from '../useCoachConversations';
import { useDeleteConversation } from '../useDeleteConversation';
import { useRenameConversation } from '../useRenameConversation';
import { fetchCoachConversation, useCoachConversation } from '../useCoachConversation';
import { useConversationByActivity } from '../useConversationByActivity';
import { call } from '../../api';
import { queryKeys } from '../../keys';
import { queryClient, resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

const conversation = (id, title) => ({
  id,
  title,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  message_count: '4',
});

describe('coach conversation hooks', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('useDeleteConversation removes the row optimistically before the request resolves', async () => {
    const list = [conversation('a', 'Ride A'), conversation('b', 'Ride B')];
    let resolveDelete;
    call
      .mockResolvedValueOnce(list)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDelete = resolve; }))
      .mockResolvedValueOnce([list[1]]);

    const { result } = renderHook(
      () => ({ list: useCoachConversations(), del: useDeleteConversation() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toEqual(list));

    act(() => {
      result.current.del.mutate('a');
    });
    await waitFor(() => expect(result.current.list.data).toEqual([list[1]]));
    expect(resolveDelete).toBeDefined();

    await act(async () => {
      resolveDelete({ success: true });
    });
    await waitFor(() => expect(result.current.del.isSuccess).toBe(true));
    expect(call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'DELETE', path: '/api/coach/conversations/:id' }),
      { params: { id: 'a' } },
    );
  });

  it('useDeleteConversation restores the list when the request fails', async () => {
    const list = [conversation('a', 'Ride A'), conversation('b', 'Ride B')];
    call
      .mockResolvedValueOnce(list)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(list);

    const { result } = renderHook(
      () => ({ list: useCoachConversations(), del: useDeleteConversation() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toEqual(list));

    await act(async () => {
      await result.current.del.mutateAsync('a').catch(() => undefined);
    });
    await waitFor(() => expect(result.current.list.data).toEqual(list));
  });

  it('useRenameConversation patches the title into the cached list', async () => {
    const list = [conversation('a', 'Ride A')];
    call
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce({ ...list[0], title: 'Sunday climb' })
      .mockResolvedValueOnce([{ ...list[0], title: 'Sunday climb' }]);

    const { result } = renderHook(
      () => ({ list: useCoachConversations(), rename: useRenameConversation() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toEqual(list));

    await act(async () => {
      await result.current.rename.mutateAsync({ id: 'a', title: 'Sunday climb' });
    });
    await waitFor(() => expect(result.current.list.data[0].title).toBe('Sunday climb'));
    expect(call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'PATCH', path: '/api/coach/conversations/:id' }),
      { params: { id: 'a' }, body: { title: 'Sunday climb' } },
    );
  });

  it('fetchCoachConversation and useCoachConversation share one cache entry', async () => {
    const detail = { conversation: conversation('a', 'Ride A'), messages: [] };
    call.mockResolvedValueOnce(detail);

    const fetched = await fetchCoachConversation(queryClient, 'a');
    expect(fetched).toEqual(detail);

    expect(queryClient.getQueryData(queryKeys.coachConversation('a'))).toEqual(detail);

    // The hook starts from the cached detail on its first render (the test
    // harness's staleTime 0 then revalidates in the background).
    call.mockResolvedValueOnce(detail);
    const { result } = renderHook(() => useCoachConversation('a'), { wrapper: Wrapper });
    expect(result.current.data).toEqual(detail);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });

  it('useConversationByActivity stays idle without an id and resolves null for an undiscussed ride', async () => {
    const idle = renderHook(() => useConversationByActivity(null), { wrapper: Wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');

    call.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useConversationByActivity(42), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/coach/conversations/by-activity/:activityId' }),
      { params: { activityId: 42 } },
    );
  });
});
