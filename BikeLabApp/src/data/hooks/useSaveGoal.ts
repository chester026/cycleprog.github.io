import {useMutation} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {Goal, GoalCreateBody, GoalUpdateBody} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export type SaveGoalInput =
  | {id?: undefined; body: GoalCreateBody}
  | {id: string | number; body: GoalUpdateBody};

/** POST /api/goals (create) or PUT /api/goals/:id (update) — invalidates goals + the owning meta-goal's sub-goals. */
export function useSaveGoal() {
  return useMutation({
    mutationFn: (input: SaveGoalInput) =>
      apiFetch(input.id === undefined ? '/api/goals' : `/api/goals/${input.id}`, {
        method: input.id === undefined ? 'POST' : 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input.body),
      }) as Promise<Goal>,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.goals});
      // Prefix match — also invalidates every useMetaGoalDetail(id) entry
      // (['metaGoals', id]), since a sub-goal's save changes its parent's
      // sub_goals/progress too.
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
    },
  });
}
