import {useQuery} from '@tanstack/react-query';
import {api, analytics} from '../api';
import type {EndpointResponse} from '../api';
import {queryKeys} from '../keys';

// GET /api/analytics/summary?period=... response — now the contract's
// `analytics.summary.response` (packages/shared/src/api/contract/
// analytics.ts, derived from server/services/analytics.js's
// computeAnalyticsSummary), replacing the hand-written loose type
// AnalysisScreen/PowerAnalysis used to read `summary.vo2max`/`summary.power`
// off of.
export type AnalyticsSummaryResponse = EndpointResponse<typeof analytics.summary>;

/** GET /api/analytics/summary?period=<period> (e.g. '4w'). */
export function useAnalyticsSummary(period: string) {
  return useQuery({
    queryKey: queryKeys.analyticsSummary(period),
    queryFn: () => api.call(analytics.summary, {query: {period}}),
  });
}
