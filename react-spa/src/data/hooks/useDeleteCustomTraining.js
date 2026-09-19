import { useMutation } from '@tanstack/react-query';
import { call, training } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/**
 * DELETE /api/training-plan/custom/:dayKey — remove a day's custom
 * training, reverting it back to the generated plan (or empty, in the
 * manual view). Added for T-6.3 (WeeklyTrainingCalendar split, audit W-21).
 */
export function useDeleteCustomTraining() {
  return useMutation({
    mutationFn: (dayKey) => call(training.deleteCustom, { params: { dayKey } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trainingPlan });
    },
  });
}
