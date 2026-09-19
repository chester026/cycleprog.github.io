import { useQuery } from '@tanstack/react-query';
import { call, skills } from '../api';
import { queryKeys } from '../keys';

/** GET /api/skills. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => call(skills.get),
  });
}
