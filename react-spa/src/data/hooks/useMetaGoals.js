import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/**
 * GET /api/meta-goals — the list of meta-goals (each carrying its
 * `sub_goals`, W-33). MetaGoalRow reads its sub-goals from this list via a
 * prop from the parent instead of fetching `/api/meta-goals/:id` per row
 * (the N+1 the audit flagged).
 */
export function useMetaGoals() {
  return useQuery({
    queryKey: queryKeys.metaGoals,
    queryFn: () => apiFetch('/api/meta-goals'),
  });
}

/** GET /api/meta-goals/:id — envelope of {metaGoal, subGoals}. */
export function useMetaGoal(id) {
  return useQuery({
    queryKey: queryKeys.metaGoal(id ?? ''),
    queryFn: () => apiFetch(`/api/meta-goals/${id}`),
    enabled: id !== null && id !== undefined,
  });
}
