import { useQuery } from '@tanstack/react-query';
import { call, training } from '../api';
import { queryKeys } from '../keys';

/** GET /api/training-plan. */
export function useTrainingPlan() {
  return useQuery({
    queryKey: queryKeys.trainingPlan,
    queryFn: () => call(training.plan),
  });
}
