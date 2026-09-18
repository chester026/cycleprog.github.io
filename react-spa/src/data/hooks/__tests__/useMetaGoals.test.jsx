import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMetaGoals } from '../useMetaGoals';
import { useDeleteMetaGoal } from '../useDeleteMetaGoal';
import { apiFetch } from '../../../utils/api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useMetaGoals / useDeleteMetaGoal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('refetches GET /api/meta-goals after useDeleteMetaGoal succeeds (invalidation)', async () => {
    const before = [
      { id: 1, title: 'Ride 300km', status: 'active', sub_goals: [] },
      { id: 2, title: 'Climb 2000m', status: 'active', sub_goals: [] },
    ];
    const after = [{ id: 2, title: 'Climb 2000m', status: 'active', sub_goals: [] }];

    apiFetch
      .mockResolvedValueOnce(before) // initial useMetaGoals() fetch
      .mockResolvedValueOnce({ success: true }) // DELETE /api/meta-goals/1
      .mockResolvedValueOnce(after); // refetch triggered by invalidateQueries

    const { result } = renderHook(
      () => ({ metaGoals: useMetaGoals(), del: useDeleteMetaGoal() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.metaGoals.data).toEqual(before));

    await act(async () => {
      await result.current.del.mutateAsync(1);
    });

    await waitFor(() => expect(result.current.metaGoals.data).toEqual(after));

    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/meta-goals/1', { method: 'DELETE' });
  });
});
