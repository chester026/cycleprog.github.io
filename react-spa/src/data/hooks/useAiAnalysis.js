import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';

/** POST /api/ai-analysis — TrainingsPage's per-ride "AI Analysis" action. Not cached (a fresh AI call each time by design). */
export function useAiAnalysis() {
  return useMutation({
    mutationFn: (summary) =>
      apiFetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      }),
  });
}
