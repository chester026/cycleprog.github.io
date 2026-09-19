import {useQuery} from '@tanstack/react-query';
import {api, bikes} from '../api';
import {queryKeys} from '../keys';

/** GET /api/bikes. */
export function useBikes() {
  return useQuery({
    queryKey: queryKeys.bikes,
    queryFn: () => api.call(bikes.list),
  });
}
