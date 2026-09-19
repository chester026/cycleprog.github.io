import { useQuery } from '@tanstack/react-query';
import { call, training } from '../api';
import { queryKeys } from '../keys';

/** GET /api/training-types — the static training-type reference catalog. */
export function useTrainingTypes(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trainingTypes,
    queryFn: () => call(training.types),
    enabled,
  });
}
