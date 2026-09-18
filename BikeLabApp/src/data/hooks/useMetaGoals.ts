import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {MetaGoal, MetaGoalDetail} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/** GET /api/meta-goals. */
export function useMetaGoals() {
  return useQuery({
    queryKey: queryKeys.metaGoals,
    queryFn: () => apiFetch('/api/meta-goals') as Promise<MetaGoal[]>,
  });
}

/** GET /api/meta-goals/:id — envelope of {metaGoal, subGoals}. */
export function useMetaGoalDetail(id: string | number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.metaGoalDetail(id ?? ''),
    queryFn: () => apiFetch(`/api/meta-goals/${id}`) as Promise<MetaGoalDetail>,
    enabled: id !== null && id !== undefined,
  });
}
