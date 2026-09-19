import {useMutation} from '@tanstack/react-query';
import {api, userProfile} from '../api';
import type {UserProfile, UserProfileUpdate} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

/** PUT /api/user-profile — used by AccountSettings/PersonalInfo/HRZones/TrainingSettings screens. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (update: UserProfileUpdate) => api.call(userProfile.update, {body: update}),
    onSuccess: updated => {
      queryClient.setQueryData<UserProfile>(queryKeys.profile, updated);
      queryClient.invalidateQueries({queryKey: queryKeys.profile});
    },
  });
}
