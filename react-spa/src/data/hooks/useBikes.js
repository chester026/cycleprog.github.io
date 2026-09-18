import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/bikes. */
export function useBikes() {
  return useQuery({
    queryKey: queryKeys.bikes,
    queryFn: () => apiFetch('/api/bikes'),
  });
}
