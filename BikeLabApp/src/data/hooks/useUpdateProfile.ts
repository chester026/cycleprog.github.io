import {useMutation} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {UserProfile, UserProfileUpdate} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** PUT /api/user-profile — used by AccountSettings/PersonalInfo/HRZones/TrainingSettings screens. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (update: UserProfileUpdate) =>
      apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(update),
      }) as Promise<UserProfile>,
    onSuccess: updated => {
      queryClient.setQueryData<UserProfile>(queryKeys.profile, updated);
      queryClient.invalidateQueries({queryKey: queryKeys.profile});
    },
  });
}
