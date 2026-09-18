import {useMutation} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** GET /api/oura/connect-state — returns the OAuth consent URL to open in the system browser. */
export function useOuraConnect() {
  return useMutation({
    mutationFn: () => apiFetch('/api/oura/connect-state') as Promise<{authUrl: string}>,
  });
}

/** POST /api/oura/sync — invalidates useOuraStatus() so the metrics card reflects the fresh sync. */
export function useOuraSync() {
  return useMutation({
    mutationFn: () => apiFetch('/api/oura/sync', {method: 'POST'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.ouraStatus});
    },
  });
}

/** POST /api/oura/unlink. */
export function useOuraDisconnect() {
  return useMutation({
    mutationFn: () => apiFetch('/api/oura/unlink', {method: 'POST'}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.ouraStatus});
    },
  });
}
