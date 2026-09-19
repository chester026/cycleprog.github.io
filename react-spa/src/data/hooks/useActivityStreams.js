import { useQuery } from '@tanstack/react-query';
import { call, activities } from '../api';
import { queryKeys } from '../keys';

const DEFAULT_DOWNSAMPLE = 400;

/**
 * GET /api/activities/:id/streams?downsample=<n> — replaces the ad-hoc
 * `streams_${activityId}` localStorage cache (utils/heartRateZones.js) with
 * the shared query cache. Pass `downsample: null` for the rare caller that
 * needs full resolution.
 */
export function useActivityStreams(activityId, opts = {}) {
  const downsample = opts.downsample === undefined ? DEFAULT_DOWNSAMPLE : opts.downsample;
  return useQuery({
    queryKey: queryKeys.activityStreams(activityId ?? '', downsample),
    queryFn: () =>
      call(activities.streams, {
        params: { id: activityId },
        query: downsample ? { downsample } : undefined,
      }),
    enabled: (opts.enabled ?? true) && activityId != null,
  });
}
