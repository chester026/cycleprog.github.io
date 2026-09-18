import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTrainingPlan } from '../useTrainingPlan';
import { useSaveCustomTraining } from '../useSaveCustomTraining';
import { useDeleteCustomTraining } from '../useDeleteCustomTraining';
import { apiFetch } from '../../../utils/api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useSaveCustomTraining / useDeleteCustomTraining', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('POSTs the custom training and refetches the plan on success', async () => {
    const before = { plan: {}, customPlan: {} };
    const after = { plan: {}, customPlan: { monday: { type: 'tempo' } } };

    apiFetch
      .mockResolvedValueOnce(before) // initial useTrainingPlan() fetch
      .mockResolvedValueOnce({ ok: true }) // the POST
      .mockResolvedValueOnce(after); // refetch triggered by invalidateQueries

    const { result } = renderHook(() => ({ plan: useTrainingPlan(), save: useSaveCustomTraining() }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.plan.data).toEqual(before));

    await act(async () => {
      await result.current.save.mutateAsync({ dayKey: 'monday', training: { type: 'tempo' } });
    });

    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/training-plan/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayKey: 'monday', training: { type: 'tempo' } }),
    });
    await waitFor(() => expect(result.current.plan.data).toEqual(after));
  });

  it('DELETEs the day and refetches the plan on success', async () => {
    const before = { plan: {}, customPlan: { monday: { type: 'tempo' } } };
    const after = { plan: {}, customPlan: {} };

    apiFetch
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(after);

    const { result } = renderHook(() => ({ plan: useTrainingPlan(), remove: useDeleteCustomTraining() }), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.plan.data).toEqual(before));

    await act(async () => {
      await result.current.remove.mutateAsync('monday');
    });

    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/training-plan/custom/monday', { method: 'DELETE' });
    await waitFor(() => expect(result.current.plan.data).toEqual(after));
  });
});
