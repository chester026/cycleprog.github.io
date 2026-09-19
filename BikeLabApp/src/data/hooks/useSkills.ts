import {useQuery} from '@tanstack/react-query';
import {api, skills} from '../api';
import type {EndpointResponse} from '../api';
import {queryKeys} from '../keys';

// GET /api/skills response envelope — now the contract's `skills.get.response`
// (packages/shared/src/api/contract/skills.ts), same shape the hand-written
// type here used to describe.
export type SkillsResponse = EndpointResponse<typeof skills.get>;

/** GET /api/skills. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => api.call(skills.get),
  });
}
