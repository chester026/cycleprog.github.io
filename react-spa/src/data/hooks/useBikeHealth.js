import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/bikes/:id/health — MaintenancePage's per-bike component health board. */
export function useBikeHealth(bikeId) {
  return useQuery({
    queryKey: queryKeys.bikeHealth(bikeId ?? ''),
    queryFn: () => apiFetch(`/api/bikes/${bikeId}/health`),
    enabled: bikeId != null,
  });
}

/** POST /api/bikes/:bikeId/components/:componentId/reset — "Mark as Replaced". */
export function useResetBikeComponent() {
  return useMutation({
    mutationFn: ({ bikeId, componentId }) =>
      apiFetch(`/api/bikes/${bikeId}/components/${componentId}/reset`, { method: 'POST' }),
    onSuccess: (_data, { bikeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bikeHealth(bikeId) });
    },
  });
}

/** PUT /api/bikes/:bikeId/labels — custom component/group names. */
export function useSaveBikeLabels() {
  return useMutation({
    mutationFn: ({ bikeId, labels }) =>
      apiFetch(`/api/bikes/${bikeId}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      }),
    onSuccess: (_data, { bikeId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bikeHealth(bikeId) });
    },
  });
}
