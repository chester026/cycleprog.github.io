import {useQuery} from '@tanstack/react-query';
import {api, activities} from '../api';
import {queryKeys} from '../keys';
import type {StreamData} from '../../utils/streamsCache';

export interface UseActivityStreamsOptions {
  /** Reduces every stream to at most this many points via the server's
   * `?downsample=<n>` bucket-average (see `GET /api/activities/:id/streams`,
   * server/lib/downsampleStreams.js). Pass `null` for the rare caller that
   * genuinely needs full resolution (e.g. per-second FTP interval
   * detection). Defaults to 400 — enough for any chart this app renders. */
  downsample?: number | null;
  enabled?: boolean;
}

const DEFAULT_DOWNSAMPLE = 400;

/**
 * GET /api/activities/:id/streams (T-5.1, T-3.6/A-04). Chart-only stream
 * data through TanStack Query instead of `utils/streamsCache.ts`'s
 * hand-rolled in-memory LRU — no AsyncStorage involved either way, this
 * just gives RideAnalyticsScreen the same
 * loading/error/cache-by-query-key behaviour every other screen's data
 * already has. `utils/streamsCache.ts` itself is unchanged (GarageScreen's
 * Share Studio, outside this task's ownership, still calls it directly).
 */
export function useActivityStreams(
  activityId: number | string | undefined,
  opts: UseActivityStreamsOptions = {},
) {
  const downsample = opts.downsample === undefined ? DEFAULT_DOWNSAMPLE : opts.downsample;
  return useQuery({
    queryKey: queryKeys.activityStreams(activityId ?? '', downsample),
    queryFn: () =>
      api.call(activities.streams, {
        params: {id: Number(activityId)},
        query: downsample ? {downsample} : {},
      }) as Promise<StreamData>,
    enabled: (opts.enabled ?? true) && activityId != null,
  });
}
