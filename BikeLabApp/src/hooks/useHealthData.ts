import {useHealthContext} from '../data/HealthProvider';
import type {UseHealthDataResult} from '../data/HealthProvider';

export type {UseHealthDataResult};

// T-5.1/A-13 (docs/audit/layers/02-bikelabapp.md): this used to run its own
// effect (cache read + conditional HealthKit refresh) independently in
// EVERY component that called it — 10 goal cards on screen meant 10
// independent "is the snapshot stale?" checks and, worst case, 10x8
// HealthKit queries for one render of a screen. The actual implementation
// now lives once in <HealthProvider> (src/data/HealthProvider.tsx, mounted
// in App.tsx); this keeps the hook's old signature/name for every existing
// caller but just reads that single shared instance from context.
export function useHealthData(): UseHealthDataResult {
  return useHealthContext();
}
