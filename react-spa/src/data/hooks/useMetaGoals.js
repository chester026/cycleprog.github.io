import { useQuery } from '@tanstack/react-query';
import { call, metaGoals } from '../api';
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
    queryFn: () => call(metaGoals.list),
  });
}

/** GET /api/meta-goals/:id — envelope of {metaGoal, subGoals}. */
export function useMetaGoal(id) {
  return useQuery({
    queryKey: queryKeys.metaGoal(id ?? ''),
    queryFn: () => call(metaGoals.detail, { params: { id } }),
    enabled: id !== null && id !== undefined,
  });
}
