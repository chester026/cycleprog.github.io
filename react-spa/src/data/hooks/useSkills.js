import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/skills. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => apiFetch('/api/skills'),
  });
}
