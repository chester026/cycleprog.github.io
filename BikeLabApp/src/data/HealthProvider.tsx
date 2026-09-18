import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react';
import {Platform} from 'react-native';
import {
  initHealthKit,
  fetchHealthSnapshot,
  getCachedHealth,
  isSnapshotFresh,
  disconnectHealth,
  buildHealthContext,
  EMPTY_HEALTH_SNAPSHOT,
  HealthSnapshot,
} from '../utils/healthService';
import {logger} from '../lib/logger';

// Cache-first, per APPLE_HEALTH_IMPLEMENTATION_PLAN.md §3 step 4. A snapshot
// under 4h old is used as-is; older (or missing) is refreshed in the
// background on mount, but ONLY if the user has already connected — we
// never trigger the permission dialog implicitly, that's only ever a
// result of the user tapping "Connect" on AppleHealthScreen.
const FRESHNESS_WINDOW_MS = 4 * 60 * 60 * 1000;

export interface UseHealthDataResult {
  snapshot: HealthSnapshot | null;
  isLoading: boolean;
  isConnected: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  healthContext: ReturnType<typeof buildHealthContext>;
}

// T-5.1/A-13 (docs/audit/layers/02-bikelabapp.md): single provider owning
// the HealthKit snapshot, mounted once in App.tsx. Was previously
// `useHealthData` itself — every card/screen that called the hook ran this
// whole effect (cache read + conditional 8-query HealthKit refresh)
// independently. `src/hooks/useHealthData.ts` now just reads this context,
// so the effect below runs exactly once no matter how many consumers there
// are.
const HealthContext = createContext<UseHealthDataResult | null>(null);

export const HealthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      if (Platform.OS !== 'ios') {
        if (mountedRef.current) {
          setSnapshot(EMPTY_HEALTH_SNAPSHOT);
          setIsLoading(false);
        }
        return;
      }

      const cached = await getCachedHealth();
      if (cached?.isConnected) {
        if (mountedRef.current) setSnapshot(cached);
        if (isSnapshotFresh(cached, FRESHNESS_WINDOW_MS)) {
          if (mountedRef.current) setIsLoading(false);
          return;
        }
        // Stale but previously connected — refresh quietly in the background.
        try {
          const fresh = await fetchHealthSnapshot();
          if (mountedRef.current) setSnapshot(fresh);
        } catch (err) {
          logger.warn('[Health] background refresh failed:', err);
        }
      } else if (mountedRef.current) {
        setSnapshot(cached ?? EMPTY_HEALTH_SNAPSHOT);
      }

      if (mountedRef.current) setIsLoading(false);
    })();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Triggers the HealthKit permission dialog (via initHealthKit) and, if
  // completed, fetches a first snapshot right away so AppleHealthScreen and
  // the coach have data immediately instead of waiting for the next mount.
  const connect = useCallback(async (): Promise<boolean> => {
    const requested = await initHealthKit();
    if (!requested) return false;
    try {
      const fresh = await fetchHealthSnapshot();
      if (mountedRef.current) setSnapshot(fresh);
      return true;
    } catch (err) {
      logger.warn('[Health] initial snapshot fetch failed:', err);
      return false;
    }
  }, []);

  // Clears our local cache/state. Does NOT revoke the underlying HealthKit
  // grant — that can only be done by the user via iOS Settings → Privacy →
  // Health, HealthKit has no programmatic revoke API.
  const disconnect = useCallback(async () => {
    await disconnectHealth();
    if (mountedRef.current) setSnapshot(EMPTY_HEALTH_SNAPSHOT);
  }, []);

  const refresh = useCallback(async () => {
    if (!snapshot?.isConnected) return;
    try {
      const fresh = await fetchHealthSnapshot();
      if (mountedRef.current) setSnapshot(fresh);
    } catch (err) {
      logger.warn('[Health] manual refresh failed:', err);
    }
  }, [snapshot?.isConnected]);

  const value: UseHealthDataResult = {
    snapshot,
    isLoading,
    isConnected: !!snapshot?.isConnected,
    connect,
    disconnect,
    refresh,
    healthContext: buildHealthContext(snapshot),
  };

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
};

export function useHealthContext(): UseHealthDataResult {
  const ctx = useContext(HealthContext);
  if (!ctx) {
    throw new Error('useHealthContext() must be used within <HealthProvider>');
  }
  return ctx;
}
