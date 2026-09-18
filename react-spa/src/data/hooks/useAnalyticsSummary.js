import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
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
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (year) params.set('year', year);
  const query = params.toString();

  return useQuery({
    queryKey: queryKeys.analyticsSummary(period ?? (year ? `year:${year}` : undefined)),
    queryFn: () => apiFetch(`/api/analytics/summary${query ? `?${query}` : ''}`),
  });
}
