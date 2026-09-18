import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** POST /api/meta-goals/ai-generate — GoalAssistantPage's "Generate Goal Plan". */
export function useGenerateAiGoals() {
  return useMutation({
    mutationFn: (userGoalDescription) =>
      apiFetch('/api/meta-goals/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userGoalDescription }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metaGoals });
    },
  });
}
