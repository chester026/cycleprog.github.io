// Chart-only stream loading (T-3.6, docs/audit/00-AUDIT-AND-PLAN.md T-3.6,
// docs/audit/layers/04-cross-layer.md §4.6, docs/audit/layers/
// 02-bikelabapp.md A-04). This used to persist full-resolution Strava
// streams (per-second heart-rate/cadence/watts/... arrays — a 3h ride is
// ~10,800 points per field) into AsyncStorage for up to 7 days per
// activity, and `preloadStreamsForPeriod` warmed that cache for every ride
// in the last 28 days. 15-20 rides routinely exceeded AsyncStorage's
// default Android limit (6MB).
//
// FTP / high-intensity-interval analysis (the one consumer that ever
// needed full-resolution streams) now runs server-side
// (`GET /api/analytics/ftp`, `services/ftpAnalysis.js`) and is never
// computed on-device any more — see the now-deleted `utils/ftpAnalysis.ts`
// and `FTPAnalysis.tsx`'s new implementation. Every remaining consumer here
// (`RideAnalyticsScreen`, `GarageScreen`'s Share Studio) only ever renders a
// fixed-width chart, so this module always requests the server's
// `?downsample=<n>` reduced stream (default 400 points — plenty for a
// chart, a small fraction of the full-resolution payload) and keeps at most
// `MAX_CACHE_ENTRIES` of them in an in-memory (module-level) LRU Map —
// nothing is persisted to AsyncStorage any more, so this cache is empty
// again on every app restart, which is fine: it exists purely to avoid a
// redundant network round trip while the user is still looking at the same
// ride.
import {apiFetch} from './api';
import {logger} from '../lib/logger';

export interface StreamData {
  heartrate?: {data: number[]};
  cadence?: {data: number[]};
  watts?: {data: number[]};
  altitude?: {data: number[]};
  velocity_smooth?: {data: number[]};
  time?: {data: number[]};
  latlng?: {data: [number, number][]};
}

const DEFAULT_CHART_DOWNSAMPLE_POINTS = 400;
const MAX_CACHE_ENTRIES = 20;

const memoryCache = new Map<string, StreamData>();

function cacheKeyFor(activityId: number, downsamplePoints: number | null): string {
  return `${activityId}:${downsamplePoints ?? 'full'}`;
}

function rememberInCache(key: string, value: StreamData): void {
  memoryCache.delete(key); // re-insert to mark as most-recently-used
  memoryCache.set(key, value);
  while (memoryCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey === undefined) break;
    memoryCache.delete(oldestKey);
  }
}

/**
 * Fetches this activity's stream data, downsampled to `downsamplePoints`
 * (default 400 — enough for any chart this app renders) unless
 * `downsamplePoints: null` is passed for the rare case a caller genuinely
 * needs full resolution. Cached in-memory only (see file header) — never
 * AsyncStorage.
 */
export const getActivityStreams = async (
  activityId: number,
  opts: {downsamplePoints?: number | null} = {},
): Promise<StreamData | null> => {
  const downsamplePoints = opts.downsamplePoints === undefined ? DEFAULT_CHART_DOWNSAMPLE_POINTS : opts.downsamplePoints;
  const key = cacheKeyFor(activityId, downsamplePoints);

  const cached = memoryCache.get(key);
  if (cached) {
    rememberInCache(key, cached); // touch for LRU
    return cached;
  }

  try {
    const query = downsamplePoints ? `?downsample=${downsamplePoints}` : '';
    const streams = await apiFetch(`/api/activities/${activityId}/streams${query}`);
    if (!streams) return null;
    rememberInCache(key, streams);
    return streams;
  } catch (error) {
    logger.error(`[streamsCache] failed to load streams for activity ${activityId}:`, error);
    return null;
  }
};
