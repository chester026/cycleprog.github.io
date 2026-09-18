import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryKeys} from '../keys';

// GET /api/analytics/summary?period=... response (server/services/
// analytics.js's computeAnalyticsSummary) — no shared zod schema yet for
// this one, so typed loosely by hand from what AnalysisScreen/PowerAnalysis
// actually read off it (`summary.vo2max`, `summary.power`, ...).
export interface AnalyticsSummaryResponse {
  summary: {
    vo2max?: number | null;
    power?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** GET /api/analytics/summary?period=<period> (e.g. '4w'). */
export function useAnalyticsSummary(period: string) {
  return useQuery({
    queryKey: queryKeys.analyticsSummary(period),
    queryFn: () => apiFetch(`/api/analytics/summary?period=${period}`) as Promise<AnalyticsSummaryResponse>,
  });
}
