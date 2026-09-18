import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {AnalyticsSnapshot} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/**
 * GET /api/analytics-snapshot/latest (T-5.4/A-27 — GarageScreen's
 * power/HR/cadence/VO2max snapshot cards). Real replacement for the
 * `getLatestSnapshot()` deprecated shim in `utils/analyticsSnapshot.ts`
 * (that shim exists only for callers that can't take a hook wave-1-era;
 * this screen now can).
 */
export function useLatestSnapshot() {
  return useQuery({
    queryKey: queryKeys.analyticsSnapshotLatest,
    queryFn: () =>
      apiFetch('/api/analytics-snapshot/latest') as Promise<AnalyticsSnapshot | null>,
  });
}

/** GET /api/analytics-snapshot/history?limit=<limit> — used to derive the trend badges next to the snapshot cards. */
export function useSnapshotHistory(limit = 12) {
  return useQuery({
    queryKey: queryKeys.analyticsSnapshotHistory(limit),
    queryFn: () =>
      apiFetch(`/api/analytics-snapshot/history?limit=${limit}`).then(
        res => res || [],
      ) as Promise<AnalyticsSnapshot[]>,
  });
}
