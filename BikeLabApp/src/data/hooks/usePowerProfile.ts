import {useQuery} from '@tanstack/react-query';
import {api, analytics} from '../api';
import {queryKeys} from '../keys';

/**
 * GET /api/analytics/power-profile — the rider's FTP estimate and Coggan
 * zones (server-side from power-meter rides). Zones are empty when no FTP
 * can be estimated; RideStats hides the power profile then.
 */
export function usePowerProfile() {
  return useQuery({
    queryKey: queryKeys.powerProfile,
    queryFn: () => api.call(analytics.powerProfile),
    staleTime: 60 * 60 * 1000,
  });
}
