import { useQuery, useMutation } from '@tanstack/react-query';
import { call, events } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/events — EventsHero / EventsManager. */
export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => call(events.list),
  });
}

/** POST /api/events (create) or PUT /api/events/:id (update). */
export function useSaveEvent() {
  return useMutation({
    mutationFn: ({ id, body }) => (id ? call(events.update, { params: { id }, body }) : call(events.create, { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}

/** DELETE /api/events/:id. */
export function useDeleteEvent() {
  return useMutation({
    mutationFn: (id) => call(events.remove, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}
