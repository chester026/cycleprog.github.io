import { useQuery, useMutation } from '@tanstack/react-query';
import { call, rides } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/rides — MyRidesBlock's planned-ride list. */
export function useRides() {
  return useQuery({
    queryKey: queryKeys.rides,
    queryFn: () => call(rides.list),
  });
}

/** POST /api/rides. */
export function useAddRide() {
  return useMutation({
    mutationFn: (body) => call(rides.create, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides });
    },
  });
}

/** DELETE /api/rides/:id. */
export function useDeleteRide() {
  return useMutation({
    mutationFn: (id) => call(rides.remove, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides });
    },
  });
}
