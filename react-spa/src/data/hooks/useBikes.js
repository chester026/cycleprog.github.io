import { useQuery } from '@tanstack/react-query';
import { call, bikes } from '../api';
import { queryKeys } from '../keys';

/** GET /api/bikes. */
export function useBikes() {
  return useQuery({
    queryKey: queryKeys.bikes,
    queryFn: () => call(bikes.list),
  });
}
