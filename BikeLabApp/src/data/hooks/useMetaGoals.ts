import {useQuery} from '@tanstack/react-query';
import {api, metaGoals} from '../api';
import {queryKeys} from '../keys';

/** GET /api/meta-goals. */
export function useMetaGoals() {
  return useQuery({
    queryKey: queryKeys.metaGoals,
    queryFn: () => api.call(metaGoals.list),
  });
}

/** GET /api/meta-goals/:id — envelope of {metaGoal, subGoals}. */
export function useMetaGoalDetail(id: string | number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.metaGoalDetail(id ?? ''),
    queryFn: () => api.call(metaGoals.detail, {params: {id: Number(id)}}),
    enabled: id !== null && id !== undefined,
  });
}
