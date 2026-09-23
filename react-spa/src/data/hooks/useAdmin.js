// AdminPage's data (hero images, Strava limits, user management).
// Not in the README's core hook list — appended for T-6.2's file ownership
// of AdminPage (see keys.js's "Appended by T-6.2" section).
import { useQuery, useMutation } from '@tanstack/react-query';
import { call, media, admin } from '../api';
import { queryClient } from '../queryClient';
import { queryKeys } from '../keys';

function invalidateHero() {
  queryClient.invalidateQueries({ queryKey: queryKeys.adminHeroImages });
}

/** GET /api/hero/images (admin management view — distinct cache entry from useHeroImages' public one). */
export function useAdminHeroImages() {
  return useQuery({
    queryKey: queryKeys.adminHeroImages,
    queryFn: () => call(media.heroImages),
  });
}

/** GET /api/admin/users -> {users}. */
export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: () => call(admin.listUsers).then((res) => res.users),
  });
}

/** GET /api/strava/limits — last-known limits, not auto-refreshed (saves API quota). */
export function useAdminStravaLimits() {
  return useQuery({
    queryKey: queryKeys.adminStravaLimits,
    queryFn: () => call(admin.stravaLimits),
    enabled: false, // only ever read via refetch(), triggered by the "Update Limits" button
  });
}

/**
 * POST /api/strava/limits/refresh — forces a fresh check against Strava's
 * own API (spends quota, so it's manual-only, same as before).
 */
export function useRefreshStravaLimits() {
  return useMutation({
    mutationFn: () => call(admin.refreshStravaLimits).then((res) => res.limits),
    onSuccess: (limits) => {
      queryClient.setQueryData(queryKeys.adminStravaLimits, limits);
    },
  });
}

/** DELETE /api/hero/positions/:position. */
export function useDeleteHeroPosition() {
  return useMutation({
    mutationFn: (position) => call(media.removeHeroImage, { params: { position } }),
    onSuccess: invalidateHero,
  });
}

// T-7.1: multipart uploads go through the contract too — callEndpoint passes
// FormData straight to client.upload (the body schema is enforced by multer).
/** POST /api/hero/assign-all (multipart FormData — one image assigned to every hero position). */
export function useAssignAllHeroImages() {
  return useMutation({
    mutationFn: (formData) => call(media.heroAssignAll, { body: formData }),
    onSuccess: invalidateHero,
  });
}

/** POST /api/hero/upload (multipart FormData — one image assigned to one position). */
export function useUploadHeroImage() {
  return useMutation({
    mutationFn: (formData) => call(media.heroUpload, { body: formData }),
    onSuccess: invalidateHero,
  });
}

/** POST /api/admin/users/:id/unlink-strava. */
export function useUnlinkAdminUserStrava() {
  return useMutation({
    mutationFn: (userId) => call(admin.unlinkUserStrava, { params: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
}

/** DELETE /api/admin/users/:id — permanently deletes the user and all related data. */
export function useDeleteAdminUser() {
  return useMutation({
    mutationFn: (userId) => call(admin.removeUser, { params: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
  });
}

// --- AI usage report (Admin "AI Usage" tab, T-6.3/T-4.4) ---

/**
 * GET /api/admin/ai-usage?days=N -> {days, users}. `users` is per-user
 * totals over the window: {user_id, requests, prompt_tokens,
 * completion_tokens, total_tokens} (see server/routes/adminAiUsage.js +
 * repositories/aiBudget.js's getUserTotals — values come back as strings
 * from Postgres bigint/int aggregates, so the table formats them, not
 * this hook).
 *
 * @returns {Promise<import('@bikelab/shared/api').EndpointResponse<typeof admin.aiUsage>>}
 */
export function useAdminAiUsage(days = 7) {
  return useQuery({
    queryKey: queryKeys.adminAiUsage(days),
    queryFn: () => call(admin.aiUsage, { query: { days } }),
  });
}
