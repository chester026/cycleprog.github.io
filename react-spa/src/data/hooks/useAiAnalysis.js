import { useMutation } from '@tanstack/react-query';
import { call, activities } from '../api';

/** POST /api/ai-analysis — TrainingsPage's per-ride "AI Analysis" action. Not cached (a fresh AI call each time by design). */
export function useAiAnalysis() {
  return useMutation({
    mutationFn: (summary) => call(activities.analyzeSummary, { body: { summary } }),
  });
}
