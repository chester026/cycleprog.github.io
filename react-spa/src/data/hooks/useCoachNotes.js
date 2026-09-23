import { useMutation, useQuery } from '@tanstack/react-query';
import { call, coach } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

/** GET /api/coach/notes — the rider-visible list of what the coach remembers (CoachMemoryCard). */
export function useCoachNotes() {
  return useQuery({
    queryKey: queryKeys.coachNotes,
    queryFn: () => call(coach.notes),
  });
}

/** POST /api/coach/notes — CoachMemoryCard's "Add note" input. */
export function useCreateCoachNote() {
  return useMutation({
    mutationFn: (body) => call(coach.createNote, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coachNotes });
    },
  });
}

/** PUT /api/coach/notes/:id — inline edit of a note's text or category. */
export function useUpdateCoachNote() {
  return useMutation({
    mutationFn: ({ id, body }) => call(coach.updateNote, { params: { id }, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coachNotes });
    },
  });
}

/** DELETE /api/coach/notes/:id. */
export function useDeleteCoachNote() {
  return useMutation({
    mutationFn: (id) => call(coach.deleteNote, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coachNotes });
    },
  });
}
