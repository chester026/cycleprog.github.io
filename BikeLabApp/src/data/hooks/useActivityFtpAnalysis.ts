import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {api, activities} from '../api';
import type {EndpointResponse} from '../api';
import {queryKeys} from '../keys';

// GET /api/activities/:id/ftp-analysis response — now the contract's
// `activities.ftpAnalysis.response` (packages/shared/src/api/contract/
// activities.ts, derived from `@bikelab/shared/calc`'s FtpAnalysisResult +
// the route's own `fromCache`). Note this DOESN'T include `hrThreshold` —
// the hand-written type here used to declare one, but the route never
// actually returns it (that field only exists on the distinct
// `GET /api/analytics/ftp?days=` aggregate, see useAnalyticsSummary-adjacent
// FTPAnalysis.tsx); this hook has no UI caller yet (see its own doc below)
// so nothing depended on that incorrect field.
export type ActivityFtpAnalysisResponse = EndpointResponse<typeof activities.ftpAnalysis>;

export interface UseActivityFtpAnalysisOptions {
  enabled?: boolean;
}

/**
 * GET /api/activities/:id/ftp-analysis (T-5.1). Per-activity FTP /
 * high-intensity-interval analysis — distinct from `GET
 * /api/analytics/ftp?days=N` (the 28-day aggregate `useAnalyticsSummary`-
 * adjacent endpoint `FTPAnalysis.tsx` already reads on AnalysisScreen).
 * Added for RideAnalyticsScreen's data-layer migration; not wired into any
 * screen's UI yet (see the wave's final report) — the server route and
 * result shape already exist, only the client hook was missing.
 */
export function useActivityFtpAnalysis(
  activityId: number | string | undefined,
  opts: UseActivityFtpAnalysisOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.activityFtpAnalysis(activityId ?? ''),
    queryFn: () => api.call(activities.ftpAnalysis, {params: {id: Number(activityId)}}),
    enabled: (opts.enabled ?? true) && activityId != null,
  } satisfies UseQueryOptions<ActivityFtpAnalysisResponse>);
}
