import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTrainingPlan } from '../useTrainingPlan';
import { useSaveCustomTraining } from '../useSaveCustomTraining';
import { useDeleteCustomTraining } from '../useDeleteCustomTraining';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useSaveCustomTraining / useDeleteCustomTraining', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('POSTs the custom training and refetches the plan on success', async () => {
    const before = { plan: {}, customPlan: {} };
    const after = { plan: {}, customPlan: { monday: { type: 'tempo' } } };

    call
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

    expect(call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'POST', path: '/api/training-plan/custom' }),
      { body: { dayKey: 'monday', training: { type: 'tempo' } } }
    );
    await waitFor(() => expect(result.current.plan.data).toEqual(after));
  });

  it('DELETEs the day and refetches the plan on success', async () => {
    const before = { plan: {}, customPlan: { monday: { type: 'tempo' } } };
    const after = { plan: {}, customPlan: {} };

    call
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

    expect(call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'DELETE', path: '/api/training-plan/custom/:dayKey' }),
      { params: { dayKey: 'monday' } }
    );
    await waitFor(() => expect(result.current.plan.data).toEqual(after));
  });
});
