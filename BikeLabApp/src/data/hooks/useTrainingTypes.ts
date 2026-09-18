import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../../utils/api';
import type {TrainingType} from '@bikelab/shared/types';
import {queryKeys} from '../keys';

/**
 * GET /api/training-types — the static training-type reference catalog
 * (server/recommendations/training-types.json). Used by GoalDetailsScreen's
 * Trainings tab and TrainingLibraryModal (T-5.4); both used to fetch this
 * independently with their own useState loading/error dance — one shared
 * query now, same cache entry for both.
 */
export function useTrainingTypes(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trainingTypes,
    queryFn: () => apiFetch('/api/training-types') as Promise<TrainingType[]>,
    enabled,
  });
}
