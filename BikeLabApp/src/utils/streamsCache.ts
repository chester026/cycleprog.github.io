// Утилита для загрузки и кеширования stream data из Strava
import {Cache, CACHE_TTL} from './cache';
import {apiFetch} from './api';
import {logger} from '../lib/logger';

export interface StreamData {
  heartrate?: {
    data: number[];
  };
  cadence?: {
    data: number[];
  };
  watts?: {
    data: number[];
  };
  altitude?: {
    data: number[];
  };
  velocity_smooth?: {
    data: number[];
  };
  time?: {
    data: number[];
  };
}

interface CachedStreams {
  data: StreamData;
  timestamp: number;
  activityId: number;
}

/**
 * Получить stream data для активности
 * Сначала проверяет кеш, если нет - загружает из API
 * @param skipAPILoad - если true, загружает только из кеша (не делает API запросы)
 */
export const getActivityStreams = async (
  activityId: number,
  skipAPILoad: boolean = false,
): Promise<StreamData | null> => {
  try {
    const cacheKey = `streams_${activityId}`;

    // Проверяем кеш (TTL 7 дней)
    const cached = await Cache.get<CachedStreams>(cacheKey);
    if (cached?.data) {
      logger.debug(`   ✅ [Streams] Cache hit for activity ${activityId}`);
      return cached.data;
    }

    // Если skipAPILoad = true, не загружаем из API
    if (skipAPILoad) {
      logger.debug(`   ⏭️ [Streams] Skip API load for activity ${activityId} (cache miss)`);
      return null;
    }

    logger.debug(`   📡 [Streams] Loading from API for activity ${activityId}...`);

    // Загружаем из API
    const streams = await apiFetch(`/api/activities/${activityId}/streams`);

    if (!streams) {
      logger.debug(`   ⚠️ [Streams] No data from API for activity ${activityId}`);
      // Кешируем пустой маркер на 7 дней (чтобы не запрашивать снова)
      await Cache.set(
        cacheKey,
        {data: null, timestamp: Date.now(), activityId},
        CACHE_TTL.WEEK,
      );
      return null;
    }

    logger.debug(`   ✅ [Streams] Loaded from API for activity ${activityId}`);
    logger.debug(`      HR points: ${streams.heartrate?.data?.length || 0}`);
    logger.debug(`      Cadence points: ${streams.cadence?.data?.length || 0}`);
    logger.debug(`      Power points: ${streams.watts?.data?.length || 0}`);

    // Кешируем на 7 дней
    await Cache.set(
      cacheKey,
      {data: streams, timestamp: Date.now(), activityId},
      CACHE_TTL.WEEK,
    );

    logger.debug(`   💾 [Streams] Cached for activity ${activityId}`);
    return streams;
  } catch (error) {
    logger.error(`   ❌ [Streams] Error loading for activity ${activityId}:`, error);
    return null;
  }
};

/**
 * Предзагрузка streams для массива активностей
 * Загружает streams в фоне для оптимизации FTP анализа
 */
export const preloadStreams = async (
  activityIds: number[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> => {
  logger.debug(`📦 Preloading streams for ${activityIds.length} activities...`);

  let loaded = 0;

  for (const activityId of activityIds) {
    await getActivityStreams(activityId, false); // skipAPILoad=false - загружаем из API
    loaded++;
    onProgress?.(loaded, activityIds.length);
  }

  logger.debug(`✅ Preloaded ${loaded} streams`);
};

/**
 * Предзагрузка streams для активностей за период
 * Используется для фоновой загрузки после появления новой тренировки
 */
export const preloadStreamsForPeriod = async (
  activities: any[],
  periodDays: number = 28,
): Promise<void> => {
  const now = new Date();
  const periodAgo = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  
  // Фильтруем активности за период с пульсом
  const filtered = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    return activityDate > periodAgo && a.average_heartrate;
  });

  logger.debug(`📦 [Streams Preload] Starting for ${filtered.length} activities (last ${periodDays} days)`);
  logger.debug(`   Total activities: ${activities.length}`);
  logger.debug(`   With HR: ${filtered.length}`);

  // Загружаем streams в фоне (по одной, чтобы не перегрузить)
  let loaded = 0;
  let fromCache = 0;
  let fromAPI = 0;
  let errors = 0;

  for (const activity of filtered) {
    try {
      logger.debug(`   📥 Preloading streams for activity ${activity.id}...`);
      const streams = await getActivityStreams(activity.id, false); // skipAPILoad=false
      
      if (streams) {
        loaded++;
        if (streams.heartrate?.data && streams.heartrate.data.length > 0) {
          fromAPI++;
          logger.debug(`      ✅ Loaded from API (HR points: ${streams.heartrate.data.length})`);
        } else {
          fromCache++;
          logger.debug(`      ✅ Loaded from cache`);
        }
      } else {
        logger.debug(`      ⚠️ No streams available`);
      }
    } catch (error) {
      errors++;
      logger.error(`      ❌ Error preloading streams for ${activity.id}:`, error);
    }
  }

  logger.debug(`📦 [Streams Preload] Completed:`);
  logger.debug(`   Loaded: ${loaded}/${filtered.length}`);
  logger.debug(`   From API: ${fromAPI}`);
  logger.debug(`   From cache: ${fromCache}`);
  logger.debug(`   Errors: ${errors}`);
};

/**
 * Очистка старых streams из кеша
 * Удаляет streams для активностей старше указанного периода
 */
export const cleanupOldStreams = async (
  olderThanDays: number = 28,
): Promise<number> => {
  try {
    const cacheInfo = await Cache.getInfo();
    const now = Date.now();
    const cutoffTime = now - olderThanDays * 24 * 60 * 60 * 1000;

    let removedCount = 0;

    for (const key of cacheInfo.keys) {
      if (key.startsWith('streams_')) {
        const cached = await Cache.get<CachedStreams>(key);
        if (cached && cached.timestamp < cutoffTime) {
          await Cache.remove(key);
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      logger.debug(`🧹 Cleaned up ${removedCount} old streams (>${olderThanDays} days)`);
    }

    return removedCount;
  } catch (error) {
    logger.error('❌ Error cleaning up old streams:', error);
    return 0;
  }
};

/**
 * Получить статистику по кешированным streams
 */
export const getStreamsCacheStats = async (): Promise<{
  total: number;
  withData: number;
  empty: number;
}> => {
  try {
    const cacheInfo = await Cache.getInfo();
    let total = 0;
    let withData = 0;
    let empty = 0;

    for (const key of cacheInfo.keys) {
      if (key.startsWith('streams_')) {
        total++;
        const cached = await Cache.get<CachedStreams>(key);
        if (cached?.data) {
          withData++;
        } else {
          empty++;
        }
      }
    }

    return {total, withData, empty};
  } catch (error) {
    logger.error('❌ Error getting streams cache stats:', error);
    return {total: 0, withData: 0, empty: 0};
  }
};
