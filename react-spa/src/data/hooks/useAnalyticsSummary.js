import { useQuery } from '@tanstack/react-query';
import { call, analytics } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/analytics/summary, filtered by `period` (e.g. '4w') and/or
 * `year` (e.g. 'all' or a 4-digit year) — the server accepts either.
 * `useAnalyticsSummary()` (no args) matches the server default.
 * `useAnalyticsSummary(period)` (a bare string) is the README's documented
 * `period` shorthand; pass `{ period, year }` for TrainingsPage's
 * year-selector filter.
 */
export function useAnalyticsSummary(opts) {
  const { period, year } = typeof opts === 'string' ? { period: opts } : opts || {};

  return useQuery({
    queryKey: queryKeys.analyticsSummary(period ?? (year ? `year:${year}` : undefined)),
    queryFn: () => call(analytics.summary, { query: { period, year } }),
  });
}
