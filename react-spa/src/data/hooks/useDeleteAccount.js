import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';

/**
 * DELETE /api/account — ProfilePage's Account Danger Zone (new UI, T-6.3;
 * the SPA previously had no way to delete an account at all — see
 * BikeLabApp/src/screens/ProfileScreen.tsx's `handleDeleteAccount` for the
 * mobile equivalent this mirrors). No cache invalidation here: the caller
 * is expected to call `useAuth().logout()` right after, which clears the
 * whole query cache anyway.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => apiFetch('/api/account', { method: 'DELETE' }),
  });
}
