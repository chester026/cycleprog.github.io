import { useMutation } from '@tanstack/react-query';
import { call, userProfile } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** PUT /api/user-profile — used by ProfilePage/GoalAssistantPage/AnalysisPage etc. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (update) => call(userProfile.update, { body: update }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
