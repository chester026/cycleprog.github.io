import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** POST /api/unlink_strava — ProfilePage's "Unlink Strava". */
export function useUnlinkStrava() {
  return useMutation({
    mutationFn: () => apiFetch('/api/unlink_strava', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
