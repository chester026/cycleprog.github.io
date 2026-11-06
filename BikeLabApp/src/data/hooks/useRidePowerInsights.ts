import { useQuery } from '@tanstack/react-query';
import { api, activities } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/activities/:id/power-breakdown — the ride's per-second power
 * breakdown plus how it ranks against the last 12 weeks (ride screen's
 * Power block). Only asked for when the ride has a watts stream: the server
 * answers `insights: null` otherwise and there is nothing to draw.
 * The ride never changes but the FTP behind IF/TSS does (new bests,
 * a manual entry), so it is refreshed after an hour.
 */
export function useRidePowerInsights(
  activityId: number | string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.ridePowerInsights(activityId),
    queryFn: () =>
      api.call(activities.powerBreakdown, {
        params: { id: Number(activityId) },
      }),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}
