import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch} from './api';
// Moved to @bikelab/shared (T-2.2, docs/audit/00-AUDIT-AND-PLAN.md,
// docs/audit/layers/04-cross-layer.md §6.1) — re-exported so existing
// `from '../utils/analyticsSnapshot'` import sites keep working.
import type {AnalyticsSnapshot} from '@bikelab/shared/types';
export type {AnalyticsSnapshot};
// computeMetricTrend/MetricTrend moved to @bikelab/shared/calc (T-2.4,
// docs/audit/layers/04-cross-layer.md §4.9/§6.1, reconciled with
// react-spa/src/utils/garageData.js's copy) — re-exported so existing
// `from '../utils/analyticsSnapshot'` import sites keep working.
import {computeMetricTrend as sharedComputeMetricTrend} from '@bikelab/shared/calc';
import type {MetricTrend as SharedMetricTrend} from '@bikelab/shared/calc';
export type MetricTrend = SharedMetricTrend;

const CACHE_KEY = 'analytics_snapshot_latest';

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

// Diff between the newest snapshot and the one before it (history[0] vs
// history[1], as returned by getSnapshotHistory — newest first). Needs two
// real rows, else every field is null so callers can hide the badge.
// avg_power/avg_hr/avg_cadence are Postgres NUMERIC columns, and
// node-postgres returns those as strings, not numbers, despite what the
// AnalyticsSnapshot type above claims — shared's computeMetricTrend guards
// against that the same way garageData.js's numeric() does on the web side.
export function computeMetricTrend(history: AnalyticsSnapshot[]): MetricTrend {
  return sharedComputeMetricTrend(history);
}
