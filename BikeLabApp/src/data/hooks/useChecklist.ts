// Checklist & todos (owner decision 18.09, T-6.x parity with the web SPA's
// react-spa/src/data/hooks/useChecklist.js). Ported "as is" — same
// endpoints, same body shapes — the app gets its own copy here because the
// web hook is untyped JS and lives in a different package.
import {useMutation, useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {
  ChecklistItem,
  ChecklistItemCreateBody,
  ChecklistItemUpdateBody,
} from '@bikelab/shared/types';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

function invalidateChecklist() {
  queryClient.invalidateQueries({queryKey: queryKeys.checklist});
}

/** GET /api/checklist. */
export function useChecklist() {
  return useQuery({
    queryKey: queryKeys.checklist,
    queryFn: () => apiFetch('/api/checklist') as Promise<ChecklistItem[]>,
  });
}

/** POST /api/checklist — {section, item, checked?}. */
export function useAddChecklistItem() {
  return useMutation({
    mutationFn: (body: ChecklistItemCreateBody) =>
      apiFetch('/api/checklist', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      }) as Promise<ChecklistItem>,
    onSuccess: invalidateChecklist,
  });
}

/** PUT /api/checklist/:id — {checked?, link?}. Used directly for link edits; see useToggleChecklistItem for the optimistic checked-toggle. */
export function useUpdateChecklistItem() {
  return useMutation({
    mutationFn: ({id, body}: {id: string | number; body: ChecklistItemUpdateBody}) =>
      apiFetch(`/api/checklist/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      }) as Promise<ChecklistItem>,
    onSuccess: invalidateChecklist,
  });
}

/**
 * PUT /api/checklist/:id — {checked}, applied optimistically to the
 * `queryKeys.checklist` cache so the checkbox flips instantly instead of
 * waiting on the round-trip (a plain `useUpdateChecklistItem` invalidate
 * only refetches after the request settles). Rolls back to the
 * pre-mutation snapshot on error.
 */
export function useToggleChecklistItem() {
  return useMutation({
    mutationFn: ({id, checked}: {id: string | number; checked: boolean}) =>
      apiFetch(`/api/checklist/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({checked}),
      }) as Promise<ChecklistItem>,
    onMutate: async ({id, checked}) => {
      await queryClient.cancelQueries({queryKey: queryKeys.checklist});
      const previous = queryClient.getQueryData<ChecklistItem[]>(queryKeys.checklist);
      queryClient.setQueryData<ChecklistItem[]>(queryKeys.checklist, old =>
        (old ?? []).map(row => (String(row.id) === String(id) ? {...row, checked} : row)),
      );
      return {previous};
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.checklist, context.previous);
      }
    },
    onSettled: invalidateChecklist,
  });
}

/** DELETE /api/checklist/:id. */
export function useDeleteChecklistItem() {
  return useMutation({
    mutationFn: (id: string | number) => apiFetch(`/api/checklist/${id}`, {method: 'DELETE'}),
    onSuccess: invalidateChecklist,
  });
}

/** DELETE /api/checklist/section/:section (double-encoded, per the server route). */
export function useDeleteChecklistSection() {
  return useMutation({
    mutationFn: (section: string) =>
      apiFetch(`/api/checklist/section/${encodeURIComponent(encodeURIComponent(section))}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidateChecklist,
  });
}
