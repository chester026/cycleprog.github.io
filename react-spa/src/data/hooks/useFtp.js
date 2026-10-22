import { useQuery } from '@tanstack/react-query';
import { call, analytics } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/analytics/ftp?days=<days> — minutes above the rider's HR
 * threshold and the count of high-intensity intervals in the window, computed
 * and cached server-side per activity (services/ftpAnalysis.js).
 *
 * `enabled: false` lets FTPAnalysis skip the request when the rider has no
 * activities in the period — the server would only return zeros.
 */
export function useFtp(days, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.ftp(days),
    queryFn: () => call(analytics.ftp, { query: { days } }),
    enabled: enabled && days != null,
  });
}
