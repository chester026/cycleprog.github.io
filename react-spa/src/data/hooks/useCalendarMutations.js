import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';

// Every useCalendar(range) key is prefixed with 'calendar' (see keys.js), so
// a prefix-matching invalidate covers every range a page may have queried
// without this hook needing to know which ones are currently mounted.
function invalidateCalendar() {
  queryClient.invalidateQueries({ queryKey: ['calendar'] });
}

/** POST /api/calendar. */
export function useCreateCalendarEvent() {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateCalendar,
  });
}

/** PUT /api/calendar/:id. */
export function useUpdateCalendarEvent() {
  return useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(`/api/calendar/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateCalendar,
  });
}

/** DELETE /api/calendar/:id. */
export function useDeleteCalendarEvent() {
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/calendar/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateCalendar,
  });
}

/** Convenience bundle matching the README's `useCalendarMutations()` naming. */
export function useCalendarMutations() {
  return {
    create: useCreateCalendarEvent(),
    update: useUpdateCalendarEvent(),
    remove: useDeleteCalendarEvent(),
  };
}
