import { useQuery } from '@tanstack/react-query';
import { call, activities } from '../api';
import { queryKeys } from '../keys';

/** Enough points for any chart the ride modal renders; the server bucket-averages to this. */
const DEFAULT_DOWNSAMPLE_POINTS = 400;

/**
 * GET /api/activities/:id/streams — Strava streams keyed by type
 * (`{heartrate: {data}, velocity_smooth: {data}, ...}`), downsampled
 * server-side (`?downsample=`, lib/downsampleStreams.js) so a 3-hour ride is
 * not 10k points per field. `downsample: null` asks for full resolution.
 */
export function useActivityStreams(activityId, { downsample = DEFAULT_DOWNSAMPLE_POINTS, enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.activityStreams(activityId ?? '', downsample),
    queryFn: () =>
      call(activities.streams, {
        params: { id: Number(activityId) },
        query: downsample ? { downsample } : {},
      }),
    enabled: enabled && activityId != null,
    // Streams of a finished ride never change — no point refetching on focus.
    staleTime: Infinity,
  });
}
