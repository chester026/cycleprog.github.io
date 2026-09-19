import { useQuery } from '@tanstack/react-query';
import { call, media } from '../api';
import { queryKeys } from '../keys';

/**
 * GET /api/hero/images — replaces `utils/heroImages.js`'s own
 * module-level `heroImagesCache`/`heroImagesCacheTime` (a second,
 * independent 5-min TTL cache duplicating this one).
 */
export function useHeroImages() {
  return useQuery({
    queryKey: queryKeys.heroImages,
    queryFn: () => call(media.heroImages),
  });
}
