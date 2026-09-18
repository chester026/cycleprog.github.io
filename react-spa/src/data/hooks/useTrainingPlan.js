import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/training-plan. */
export function useTrainingPlan() {
  return useQuery({
    queryKey: queryKeys.trainingPlan,
    queryFn: () => apiFetch('/api/training-plan'),
  });
}
