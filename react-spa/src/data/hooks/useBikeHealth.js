import { useQuery, useMutation } from '@tanstack/react-query';
import { call, bikes } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/bikes/:id/health — MaintenancePage's per-bike component health board. */
export function useBikeHealth(bikeId) {
  return useQuery({
    queryKey: queryKeys.bikeHealth(bikeId ?? ''),
    queryFn: () => call(bikes.health, { params: { bikeId } }),
    enabled: bikeId != null,
  });
}

/** POST /api/bikes/:bikeId/components/:componentId/reset — "Mark as Replaced". */
export function useResetBikeComponent() {
  return useMutation({
    mutationFn: ({ bikeId, componentId }) =>
      call(bikes.resetComponent, { params: { bikeId, component: componentId } }),
    onSuccess: (_data, { bikeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bikeHealth(bikeId) });
    },
  });
}

/** PUT /api/bikes/:bikeId/labels — custom component/group names. */
export function useSaveBikeLabels() {
  return useMutation({
    mutationFn: ({ bikeId, labels }) => call(bikes.updateLabels, { params: { bikeId }, body: { labels } }),
    onSuccess: (_data, { bikeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bikeHealth(bikeId) });
    },
  });
}
