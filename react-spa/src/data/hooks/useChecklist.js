import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

function invalidateChecklist() {
  queryClient.invalidateQueries({ queryKey: queryKeys.checklist });
}

/** GET /api/checklist. */
export function useChecklist() {
  return useQuery({
    queryKey: queryKeys.checklist,
    queryFn: () => apiFetch('/api/checklist'),
  });
}

/** POST /api/checklist — {section, item}. */
export function useAddChecklistItem() {
  return useMutation({
    mutationFn: (body) =>
      apiFetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateChecklist,
  });
}

/** PUT /api/checklist/:id — {checked} or {link}. */
export function useUpdateChecklistItem() {
  return useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(`/api/checklist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidateChecklist,
  });
}

/** DELETE /api/checklist/:id. */
export function useDeleteChecklistItem() {
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/checklist/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateChecklist,
  });
}

/** DELETE /api/checklist/section/:section (double-encoded, per the server route). */
export function useDeleteChecklistSection() {
  return useMutation({
    mutationFn: (section) =>
      apiFetch(`/api/checklist/section/${encodeURIComponent(encodeURIComponent(section))}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidateChecklist,
  });
}
