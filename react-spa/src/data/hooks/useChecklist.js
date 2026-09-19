import { useQuery, useMutation } from '@tanstack/react-query';
import { call, checklist } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

function invalidateChecklist() {
  queryClient.invalidateQueries({ queryKey: queryKeys.checklist });
}

/** GET /api/checklist. */
export function useChecklist() {
  return useQuery({
    queryKey: queryKeys.checklist,
    queryFn: () => call(checklist.list),
  });
}

/** POST /api/checklist — {section, item}. */
export function useAddChecklistItem() {
  return useMutation({
    mutationFn: (body) => call(checklist.create, { body }),
    onSuccess: invalidateChecklist,
  });
}

/** PUT /api/checklist/:id — {checked} or {link}. */
export function useUpdateChecklistItem() {
  return useMutation({
    mutationFn: ({ id, body }) => call(checklist.update, { params: { id }, body }),
    onSuccess: invalidateChecklist,
  });
}

/** DELETE /api/checklist/:id. */
export function useDeleteChecklistItem() {
  return useMutation({
    mutationFn: (id) => call(checklist.remove, { params: { id } }),
    onSuccess: invalidateChecklist,
  });
}

/** DELETE /api/checklist/section/:section (double-encoded, per the server route). */
export function useDeleteChecklistSection() {
  return useMutation({
    mutationFn: (section) =>
      call(checklist.removeSection, { params: { section: encodeURIComponent(section) } }),
    onSuccess: invalidateChecklist,
  });
}
