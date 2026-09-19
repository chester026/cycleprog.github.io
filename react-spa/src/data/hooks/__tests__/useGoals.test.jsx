import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGoals } from '../useGoals';
import { useSaveGoal } from '../useSaveGoal';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useGoals / useSaveGoal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('refetches GET /api/goals after useSaveGoal succeeds (invalidation)', async () => {
    const before = [{ id: 1, goal_type: 'distance', target_value: 100 }];
    const after = [{ id: 1, goal_type: 'distance', target_value: 150 }];

    call
      .mockResolvedValueOnce(before) // initial useGoals() fetch
      .mockResolvedValueOnce({ id: 1, goal_type: 'distance', target_value: 150 }) // the PUT/POST save
      .mockResolvedValueOnce(after); // refetch triggered by invalidateQueries

    const { result } = renderHook(
      () => ({ goals: useGoals(), save: useSaveGoal() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.goals.data).toEqual(before));

    await act(async () => {
      await result.current.save.mutateAsync({ id: 1, body: { target_value: 150 } });
    });

    // The mutation's onSuccess invalidates queryKeys.goals, so useGoals()
    // refetches on its own — no manual reload function needed.
    await waitFor(() => expect(result.current.goals.data).toEqual(after));

    expect(call).toHaveBeenCalledTimes(3);
  });
});
