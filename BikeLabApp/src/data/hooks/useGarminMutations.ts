import {useMutation} from '@tanstack/react-query';
import {api, garmin} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/**
 * POST /api/garmin/pair/confirm — binds the 6-digit code shown on the bike
 * computer to this account; the device polls and receives its token within
 * seconds (docs/plans/garmin-connect-iq.md §2.1).
 */
export function useConfirmGarminPairing() {
  return useMutation({
    mutationFn: (code: string) => api.call(garmin.pairConfirm, {body: {code}}),
    onSuccess: () => {
      // The device row appears once the computer polls — refetch shortly
      // after as well, not only now.
      queryClient.invalidateQueries({queryKey: queryKeys.garminDevices});
      setTimeout(() => queryClient.invalidateQueries({queryKey: queryKeys.garminDevices}), 4000);
    },
  });
}

/** DELETE /api/garmin/devices/:id — revokes that computer's token. */
export function useRemoveGarminDevice() {
  return useMutation({
    mutationFn: (id: number) => api.call(garmin.removeDevice, {params: {id}}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.garminDevices});
    },
  });
}

/**
 * POST /api/garmin/connect/sync — fetch the rider's latest Garmin health
 * days now (the coach chat's "Get Garmin health data" chip, the Refresh
 * button on GarminConnectCard). The response is the fresh status plus
 * `synced_days`, so the status query is updated from it without a refetch.
 */
export function useGarminConnectSync() {
  return useMutation({
    mutationFn: () => api.call(garmin.connectSync),
    onSuccess: ({synced_days: _syncedDays, ...status}) => {
      queryClient.setQueryData(queryKeys.garminConnectStatus, status);
    },
  });
}
