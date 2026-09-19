import {useQuery} from '@tanstack/react-query';
import {api, oura} from '../api';
import {queryKeys} from '../keys';

export interface OuraLatest {
  day: string;
  readiness_score: number | null;
  sleep_score: number | null;
  activity_score: number | null;
  total_sleep_hours: number | null;
  average_hrv: number | null;
  resting_heart_rate: number | null;
  min_heart_rate: number | null;
  stress_day_summary: 'restored' | 'normal' | 'stressful' | null;
  resilience_level: 'limited' | 'adequate' | 'solid' | 'strong' | 'exceptional' | null;
  spo2_average: number | null;
}

export interface OuraStatus {
  connected: boolean;
  ouraUserId: string | null;
  latest: OuraLatest | null;
}

/** GET /api/oura/status — see OuraIntegrationScreen. */
export function useOuraStatus() {
  return useQuery({
    queryKey: queryKeys.ouraStatus,
    queryFn: () => api.call(oura.status) as Promise<OuraStatus>,
  });
}
