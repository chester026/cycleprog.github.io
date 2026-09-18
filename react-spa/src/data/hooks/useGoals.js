import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/goals — shared cache entry instead of every GoalCard fetching independently. */
export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: () => apiFetch('/api/goals'),
  });
}
