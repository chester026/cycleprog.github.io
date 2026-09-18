import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/**
 * GET /api/analytics/hr-zones?period=<period> — server-computed time-in-
 * HR-zones (T-6/audit follow-up). Replaces `HeartRateZonesChart.jsx`'s old
 * client-side approach of downloading per-activity streams for up to 20
 * rides itself whenever fewer than half of them had cached streams — each
 * download was a Strava API call, with no server-side streams cache, so a
 * single Analysis page visit could burn ~20 Strava calls every time.
 *
 * The response's `coverage.pending` count means the server is still
 * finishing a backlog of un-analyzed rides in the background (see
 * services/hrZones.js's per-request stream-fetch budget); while it's > 0
 * this hook polls again after ~10s so the chart picks up the completed
 * pass without the user needing to do anything.
 */
export function useHrZonesDistribution(period) {
  return useQuery({
    queryKey: queryKeys.hrZonesDistribution(period),
    queryFn: () => apiFetch(`/api/analytics/hr-zones?period=${encodeURIComponent(period)}`),
    enabled: period != null,
    refetchInterval: (query) => (query.state.data?.coverage?.pending > 0 ? 10000 : false),
  });
}
