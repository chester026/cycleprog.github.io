import {useMutation} from '@tanstack/react-query';
import {api, auth} from '../api';
import {useProfile} from './useProfile';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

export interface StravaStatus {
  connected: boolean;
  athleteName: string | null;
  stravaId: number | string | null;
}

/**
 * Derived from useProfile() — Strava link state lives on the profile row
 * (`strava_id`/`name`), there is no separate status endpoint. Sharing the
 * profile query/cache entry (instead of StravaIntegrationScreen's own
 * `GET /api/user-profile` fetch) means linking/unlinking Strava also keeps
 * every other profile consumer (ProfileScreen, etc.) in sync for free.
 */
export function useStravaStatus() {
  const query = useProfile();
  const status: StravaStatus = {
    connected: !!query.data?.strava_id,
    athleteName: query.data?.name ?? null,
    stravaId: query.data?.strava_id ?? null,
  };
  return {...query, status};
}

/** POST /api/unlink_strava — invalidates useProfile() so useStravaStatus() reflects the disconnect. */
export function useUnlinkStrava() {
  return useMutation({
    mutationFn: () => api.call(auth.unlinkStrava),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.profile});
    },
  });
}
