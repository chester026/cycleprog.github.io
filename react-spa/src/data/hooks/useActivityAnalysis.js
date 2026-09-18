import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';

/**
 * GET /api/analytics/activity/:id — TrainingsPage's "View Details" modal,
 * fetched on click rather than kept in the query cache (each activity is
 * opened at most once per session in practice).
 */
export function useActivityAnalysis() {
  return useMutation({
    mutationFn: (activityId) => apiFetch(`/api/analytics/activity/${activityId}`),
  });
}
