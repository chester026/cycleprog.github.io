import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {Bike} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/** GET /api/bikes. */
export function useBikes() {
  return useQuery({
    queryKey: queryKeys.bikes,
    queryFn: () => apiFetch('/api/bikes') as Promise<Bike[]>,
  });
}
