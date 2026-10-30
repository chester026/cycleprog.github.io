import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActivityMetaGoalsProgress } from '../useActivityMetaGoalsProgress';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useActivityMetaGoalsProgress', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });
  afterEach(() => resetTestQueryClient());

  it('fetches GET /api/activities/:id/meta-goals-progress for the ride', async () => {
    const progress = [{ id: 1, title: 'Endurance base', status: 'active', progress: 55, progressGain: 3, contributions: [] }];
    call.mockResolvedValueOnce(progress);

    const { result } = renderHook(() => useActivityMetaGoalsProgress(42), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(progress);
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/activities/:id/meta-goals-progress' }),
      { params: { id: 42 } },
    );
  });

  it('stays idle without an activity id', () => {
    const { result } = renderHook(() => useActivityMetaGoalsProgress(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(call).not.toHaveBeenCalled();
  });
});
