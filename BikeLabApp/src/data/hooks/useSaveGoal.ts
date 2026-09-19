import {useMutation} from '@tanstack/react-query';
import {api, goals} from '../api';
import type {GoalCreateBody, GoalUpdateBody} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export type SaveGoalInput =
  | {id?: undefined; body: GoalCreateBody}
  | {id: string | number; body: GoalUpdateBody};

/** POST /api/goals (create) or PUT /api/goals/:id (update) — invalidates goals + the owning meta-goal's sub-goals. */
export function useSaveGoal() {
  return useMutation({
    mutationFn: (input: SaveGoalInput) =>
      input.id === undefined
        ? api.call(goals.create, {body: input.body})
        : api.call(goals.update, {params: {id: Number(input.id)}, body: input.body}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.goals});
      // Prefix match — also invalidates every useMetaGoalDetail(id) entry
      // (['metaGoals', id]), since a sub-goal's save changes its parent's
      // sub_goals/progress too.
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
    },
  });
}
