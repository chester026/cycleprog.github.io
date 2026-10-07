import {useMutation} from '@tanstack/react-query';
import {api, metaGoals} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export type CompleteMetaGoalInput = {
  id: string | number;
  /** Rides that did the goal; empty/omitted completes it without rides. */
  activityIds?: number[];
};

/**
 * Refetches everything a goal's open/closed state feeds: the list (Garage's
 * completed goals, GoalsPanel), the detail (key sits under `metaGoals`) and
 * sub-goals, whose progress window closes with the goal.
 */
function invalidateGoalQueries() {
  queryClient.invalidateQueries({queryKey: queryKeys.metaGoals});
  queryClient.invalidateQueries({queryKey: queryKeys.goals});
}

/** POST /api/meta-goals/:id/complete — closes the goal and attaches the rides that did it. */
export function useCompleteMetaGoal() {
  return useMutation({
    mutationFn: ({id, activityIds}: CompleteMetaGoalInput) =>
      api.call(metaGoals.complete, {params: {id: Number(id)}, body: {activity_ids: activityIds ?? []}}),
    onSuccess: (_data, {id}) => {
      invalidateGoalQueries();
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoalDetail(id)});
    },
  });
}

/** POST /api/meta-goals/:id/reopen — back to active, rides detached. */
export function useReopenMetaGoal() {
  return useMutation({
    mutationFn: (id: string | number) => api.call(metaGoals.reopen, {params: {id: Number(id)}}),
    onSuccess: (_data, id) => {
      invalidateGoalQueries();
      queryClient.invalidateQueries({queryKey: queryKeys.metaGoalDetail(id)});
    },
  });
}
