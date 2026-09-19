import {useMutation} from '@tanstack/react-query';
import {api, oura} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** GET /api/oura/connect-state — returns the OAuth consent URL to open in the system browser. */
export function useOuraConnect() {
  return useMutation({
    mutationFn: () => api.call(oura.connectState),
  });
}

/** POST /api/oura/sync — invalidates useOuraStatus() so the metrics card reflects the fresh sync. */
export function useOuraSync() {
  return useMutation({
    // `oura.sync`'s body schema has no top-level `.optional()` (every field
    // inside it is optional, but the object itself isn't) — `{body: {}}`
    // sends the same "no days override" request `apiFetch(..., {method:
    // 'POST'})` used to (server defaults `days` itself).
    mutationFn: () => api.call(oura.sync, {body: {}}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.ouraStatus});
    },
  });
}

/** POST /api/oura/unlink. */
export function useOuraDisconnect() {
  return useMutation({
    mutationFn: () => api.call(oura.unlink),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.ouraStatus});
    },
  });
}
