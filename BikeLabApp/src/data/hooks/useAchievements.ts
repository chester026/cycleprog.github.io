import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {UserAchievementsResponse} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/** GET /api/achievements/me. Evaluation itself (POST /api/achievements/evaluate) now runs server-side on new activities — see A-34. */
export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => apiFetch('/api/achievements/me') as Promise<UserAchievementsResponse>,
  });
}
