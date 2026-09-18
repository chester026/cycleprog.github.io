import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** PUT /api/user-profile — used by ProfilePage/GoalAssistantPage/AnalysisPage etc. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (update) =>
      apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}
