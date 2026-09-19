import { useQuery } from '@tanstack/react-query';
import { call, achievements } from '../api';
import { queryKeys } from '../keys';

/** GET /api/achievements/me. */
export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => call(achievements.me),
  });
}
