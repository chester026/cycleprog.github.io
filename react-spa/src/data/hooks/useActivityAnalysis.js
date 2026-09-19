import { useMutation } from '@tanstack/react-query';
import { call, analytics } from '../api';

/**
 * GET /api/analytics/activity/:id — TrainingsPage's "View Details" modal,
 * fetched on click rather than kept in the query cache (each activity is
 * opened at most once per session in practice).
 */
export function useActivityAnalysis() {
  return useMutation({
    mutationFn: (activityId) => call(analytics.activity, { params: { id: activityId } }),
  });
}
