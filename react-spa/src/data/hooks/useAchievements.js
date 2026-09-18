import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/achievements/me. */
export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => apiFetch('/api/achievements/me'),
  });
}
