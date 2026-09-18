import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../utils/api';
import { queryKeys } from '../keys';

/** GET /api/training-types — the static training-type reference catalog. */
export function useTrainingTypes(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trainingTypes,
    queryFn: () => apiFetch('/api/training-types'),
    enabled,
  });
}
