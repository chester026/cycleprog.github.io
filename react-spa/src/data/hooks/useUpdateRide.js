import { useMutation } from '@tanstack/react-query';
import { call, rides } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

// T-6.3 (audit W-26): new file rather than adding to useRides.js — GUIDE-6.md
// wants new hooks added as new files so hooks/index.js's owner list stays
// accurate. PUT /api/rides/:id backs RideAddModal's edit mode
// (MyRidesBlock "Edit" action).
/** PUT /api/rides/:id. */
export function useUpdateRide() {
  return useMutation({
    mutationFn: ({ id, ...body }) => call(rides.update, { params: { id }, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rides });
    },
  });
}
