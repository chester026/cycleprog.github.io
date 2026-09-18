import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/rides — MyRidesBlock's planned-ride list. */
export function useRides() {
  return useQuery({
    queryKey: queryKeys.rides,
    queryFn: () => apiFetch('/api/rides'),
  });
}

/** POST /api/rides. */
export function useAddRide() {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides });
    },
  });
}

/** DELETE /api/rides/:id. */
export function useDeleteRide() {
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/rides/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides });
    },
  });
}
