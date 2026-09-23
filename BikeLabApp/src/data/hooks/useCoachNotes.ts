// Coach memory (packages/shared/src/types/coachNotes.ts) — short facts the
// coach remembers about the rider ("prefers morning rides", "knee hurts on
// long climbs"), read/edited in CoachMemoryScreen and written either by the
// rider there or, in chat, by the coach's server-side
// remember_about_rider/forget_about_rider tools (useCoachChat invalidates
// `queryKeys.coachNotes` when those fire).
import {useMutation, useQuery} from '@tanstack/react-query';
import {api, coach} from '../api';
import type {CoachNoteCreateBody, CoachNoteUpdateBody} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

function invalidateCoachNotes() {
  queryClient.invalidateQueries({queryKey: queryKeys.coachNotes});
}

/** GET /api/coach/notes. */
export function useCoachNotes() {
  return useQuery({
    queryKey: queryKeys.coachNotes,
    queryFn: () => api.call(coach.notes),
  });
}

/** POST /api/coach/notes — {note, category?}. */
export function useCreateCoachNote() {
  return useMutation({
    mutationFn: (body: CoachNoteCreateBody) => api.call(coach.createNote, {body}),
    onSuccess: invalidateCoachNotes,
  });
}

/** PUT /api/coach/notes/:id — {note?, category?}. */
export function useUpdateCoachNote() {
  return useMutation({
    mutationFn: ({id, body}: {id: string | number; body: CoachNoteUpdateBody}) =>
      api.call(coach.updateNote, {params: {id: Number(id)}, body}),
    onSuccess: invalidateCoachNotes,
  });
}

/** DELETE /api/coach/notes/:id. */
export function useDeleteCoachNote() {
  return useMutation({
    mutationFn: (id: string | number) => api.call(coach.deleteNote, {params: {id: Number(id)}}),
    onSuccess: invalidateCoachNotes,
  });
}
