import { useQuery } from '@tanstack/react-query';
import { call, media } from '../api';
import { queryKeys } from '../keys';

/** GET /api/garage/positions — GaragePage's bike-garage photo slots. */
export function useGarageImages() {
  return useQuery({
    queryKey: queryKeys.garageImages,
    queryFn: () => call(media.garagePositions),
  });
}
