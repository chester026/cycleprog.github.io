import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/**
 * GET /api/analytics-snapshot/history?limit=<limit> — newest first.
 * `history[0]` doubles as "the latest snapshot" (GaragePage's power/HR/
 * cadence/VO2max cards) so the page doesn't also need a separate
 * `/api/analytics-snapshot/latest` query/cache entry.
 */
export function useAnalyticsSnapshotHistory(limit = 12) {
  return useQuery({
    queryKey: queryKeys.analyticsSnapshotHistory(limit),
    queryFn: () =>
      apiFetch(`/api/analytics-snapshot/history?limit=${limit}`).then((res) => (Array.isArray(res) ? res : [])),
  });
}
