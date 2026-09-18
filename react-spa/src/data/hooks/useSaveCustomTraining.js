import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * POST /api/training-plan/custom — save (or overwrite) a custom training
 * for one day of the week. Added for T-6.3 (WeeklyTrainingCalendar split,
 * audit W-21); `trainingPlan` embeds `customPlan` server-side, so saving
 * one just invalidates the whole plan.
 */
export function useSaveCustomTraining() {
  return useMutation({
    mutationFn: ({ dayKey, training }) =>
      apiFetch('/api/training-plan/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayKey, training }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlan });
    },
  });
}
