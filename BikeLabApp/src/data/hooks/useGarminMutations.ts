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
