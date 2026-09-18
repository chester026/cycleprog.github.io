import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/garage/positions — GaragePage's bike-garage photo slots. */
export function useGarageImages() {
  return useQuery({
    queryKey: queryKeys.garageImages,
    queryFn: () => apiFetch('/api/garage/positions'),
  });
}
