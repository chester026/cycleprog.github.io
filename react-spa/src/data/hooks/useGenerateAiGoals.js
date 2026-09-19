import { useMutation } from '@tanstack/react-query';
import { call, metaGoals } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** POST /api/meta-goals/ai-generate — GoalAssistantPage's "Generate Goal Plan". */
export function useGenerateAiGoals() {
  return useMutation({
    mutationFn: (userGoalDescription) => call(metaGoals.aiGenerate, { body: { userGoalDescription } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
