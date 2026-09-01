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

export interface MetricTrend {
  avg_power: number | null;
  avg_hr: number | null;
  avg_cadence: number | null;
}

// Diff between the newest snapshot and the one before it (history[0] vs
// history[1], as returned by getSnapshotHistory — newest first). Needs two
// real rows, else every field is null so callers can hide the badge.
// avg_power/avg_hr/avg_cadence are Postgres NUMERIC columns, and
// node-postgres returns those as strings, not numbers, despite what the
// AnalyticsSnapshot type above claims — Number() here guards against that
// the same way garageData.js's numeric() does on the web side.
export function computeMetricTrend(
  history: AnalyticsSnapshot[],
): MetricTrend {
  const empty: MetricTrend = {avg_power: null, avg_hr: null, avg_cadence: null};
  if (!Array.isArray(history) || history.length < 2) return empty;

  const [latest, previous] = history;
  const diff = (field: keyof AnalyticsSnapshot): number | null => {
    const a = latest?.[field];
    const b = previous?.[field];
    const numA = a === null || a === undefined ? null : Number(a);
    const numB = b === null || b === undefined ? null : Number(b);
    return numA !== null && numB !== null && Number.isFinite(numA) && Number.isFinite(numB)
      ? Math.round(numA - numB)
      : null;
  };

  return {
    avg_power: diff('avg_power'),
    avg_hr: diff('avg_hr'),
    avg_cadence: diff('avg_cadence'),
  };
}
