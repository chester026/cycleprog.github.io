import { useQuery } from '@tanstack/react-query';
import { call, goals } from '../api';
import { queryKeys } from '../keys';

/** GET /api/goals — shared cache entry instead of every GoalCard fetching independently. */
export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: () => call(goals.list),
  });
}
