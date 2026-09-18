import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {Goal} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/**
 * GET /api/goals (T-5.1, A-13 — every MetaGoalCard used to fetch ALL of the
 * user's goals independently and filter client-side; 10 goal cards meant
 * 10 identical requests). One shared query — GoalsPanel reads it once and
 * hands sub-goals down, or individual cards use this hook directly and
 * share the same cache entry/in-flight request.
 */
export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: () => apiFetch('/api/goals') as Promise<Goal[]>,
  });
}
