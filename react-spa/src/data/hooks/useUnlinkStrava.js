import { useMutation } from '@tanstack/react-query';
import { call, auth } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** POST /api/unlink_strava — ProfilePage's "Unlink Strava". */
export function useUnlinkStrava() {
  return useMutation({
    mutationFn: () => call(auth.unlinkStrava),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
