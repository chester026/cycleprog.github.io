import {useQuery} from '@tanstack/react-query';
import {api, achievements} from '../api';
import {queryKeys} from '../keys';

/** GET /api/achievements/me. Evaluation itself (POST /api/achievements/evaluate) now runs server-side on new activities — see A-34. */
export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => api.call(achievements.me),
  });
}
