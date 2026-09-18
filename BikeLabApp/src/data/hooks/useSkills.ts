import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {Skills, RiderProfile} from '@bikelab/shared/calc';
import type {SkillsSnapshot} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

// GET /api/skills response envelope (server/routes/skills.js) — not a
// single zod schema in @bikelab/shared yet, so typed by hand here from the
// route's `res.json({...})` shape.
export interface SkillsResponse {
  skills: Skills;
  riderProfile: RiderProfile;
  confidence: number;
  sampleSize: number;
  lastActivityId: number | string | null;
  previous: SkillsSnapshot | null;
  trend: Record<string, number | null> | null;
}

/** GET /api/skills. */
export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => apiFetch('/api/skills') as Promise<SkillsResponse>,
  });
}
