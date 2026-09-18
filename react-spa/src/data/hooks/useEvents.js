import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/events — EventsHero / EventsManager. */
export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => apiFetch('/api/events'),
  });
}

/** POST /api/events (create) or PUT /api/events/:id (update). */
export function useSaveEvent() {
  return useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(id ? `/api/events/${id}` : '/api/events', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}

/** DELETE /api/events/:id. */
export function useDeleteEvent() {
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
}
