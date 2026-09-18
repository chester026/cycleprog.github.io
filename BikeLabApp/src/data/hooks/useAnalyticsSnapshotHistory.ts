import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryKeys} from '../keys';
import type {AnalyticsSnapshot} from '@bikelab/shared/types';

/**
 * GET /api/analytics-snapshot/history?limit=<limit>. Added for T-5.1/T-5.4
 * (docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/02-bikelabapp.md
 * A-17): AnalysisScreen.tsx used to read this through the deprecated
 * `utils/analyticsSnapshot.ts` shim's `getSnapshotHistory` — this hook is
 * the real `src/data/hooks/*` replacement for that one call site (the shim
 * itself stays, since GarageScreen.tsx — outside this task's file
 * ownership — still uses it for `getLatestSnapshot`).
 */
export function useAnalyticsSnapshotHistory(limit = 12) {
  return useQuery({
    queryKey: queryKeys.analyticsSnapshotHistory(limit),
    queryFn: () =>
      apiFetch(`/api/analytics-snapshot/history?limit=${limit}`).then(
        res => (res ?? []) as AnalyticsSnapshot[],
      ),
  });
}
