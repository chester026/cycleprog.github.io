import {useQuery, type UseQueryOptions} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryKeys} from '../keys';

// GET /api/activities/:id/ftp-analysis response (server/routes/
// activities.js + services/ftpAnalysis.js's `analyzeHighIntensityTime`
// result, `@bikelab/shared/calc`'s FtpAnalysisResult shape) plus the
// route's own `fromCache` flag — no shared zod schema for the envelope
// yet, typed by hand from what the route actually returns.
export interface ActivityFtpAnalysisResponse {
  totalMinutes: number;
  totalIntervals: number;
  hrThreshold: number;
  intervals?: unknown[];
  fromCache: boolean;
  [key: string]: unknown;
}

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
    queryFn: () =>
      apiFetch(`/api/activities/${activityId}/ftp-analysis`) as Promise<ActivityFtpAnalysisResponse>,
    enabled: (opts.enabled ?? true) && activityId != null,
  } satisfies UseQueryOptions<ActivityFtpAnalysisResponse>);
}
