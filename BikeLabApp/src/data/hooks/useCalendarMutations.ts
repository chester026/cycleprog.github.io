import {useMutation} from '@tanstack/react-query';
import {api, calendar} from '../api';
import type {CalendarEventCreateBody, CalendarEventUpdateBody} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';

// All three mutations below invalidate every useCalendar(...) entry —
// `queryKeys.calendar(range)` keys are all prefixed with 'calendar', so a
// prefix-matching invalidate (no `exact`) covers every range a screen may
// have queried (CalendarScreen's month view, GoalDetailsScreen's
// per-goal filter, PlannedRidesWidget's `type` filter, ...) without this
// hook needing to know which ones are currently mounted.
function invalidateCalendar() {
  queryClient.invalidateQueries({queryKey: ['calendar']});
}

/** POST /api/calendar. */
export function useCreateCalendarEvent() {
  return useMutation({
    mutationFn: (body: CalendarEventCreateBody) => api.call(calendar.create, {body}),
    onSuccess: invalidateCalendar,
  });
}

/** PUT /api/calendar/:id. */
export function useUpdateCalendarEvent() {
  return useMutation({
    mutationFn: ({id, body}: {id: string | number; body: CalendarEventUpdateBody}) =>
      api.call(calendar.update, {params: {id: Number(id)}, body}),
    onSuccess: invalidateCalendar,
  });
}

/** DELETE /api/calendar/:id. */
export function useDeleteCalendarEvent() {
  return useMutation({
    mutationFn: (id: string | number) => api.call(calendar.remove, {params: {id: Number(id)}}),
    onSuccess: invalidateCalendar,
  });
}

/** Convenience bundle — matches the task's `useCalendarMutations()` naming; each field is independently usable. */
export function useCalendarMutations() {
  return {
    create: useCreateCalendarEvent(),
    update: useUpdateCalendarEvent(),
    remove: useDeleteCalendarEvent(),
  };
}
