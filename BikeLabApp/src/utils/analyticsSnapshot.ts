import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch} from './api';

const CACHE_KEY = 'analytics_snapshot_latest';

export interface AnalyticsSnapshot {
  id: number;
  user_id: number;
  snapshot_date: string;
  last_activity_id: number;
  avg_power: number | null;
  max_power: number | null;
  min_power: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  avg_speed: number | null;
  max_speed: number | null;
  min_speed: number | null;
  avg_cadence: number | null;
  max_cadence: number | null;
  min_cadence: number | null;
  vo2max: number | null;
  activities_count: number;
  created_at: string;
}

let memoryCache: AnalyticsSnapshot | null = null;

export async function getLatestSnapshot(
  forceRefresh = false,
): Promise<AnalyticsSnapshot | null> {
  if (!forceRefresh && memoryCache) {
    return memoryCache;
  }

  try {
    const data = await apiFetch('/api/analytics-snapshot/latest');
    if (data) {
      memoryCache = data;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {
    // Network error — fall back to local cache
  }

  if (!memoryCache) {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        memoryCache = JSON.parse(cached);
      }
    } catch {
      // storage error
    }
  }

  return memoryCache;
}

export async function getSnapshotHistory(
  limit = 12,
): Promise<AnalyticsSnapshot[]> {
  try {
    return (await apiFetch(`/api/analytics-snapshot/history?limit=${limit}`)) || [];
  } catch {
    return [];
  }
}

export function clearSnapshotCache() {
  memoryCache = null;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
