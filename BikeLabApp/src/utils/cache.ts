import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // milliseconds
}

const CACHE_PREFIX = 'bikelab_cache_';

export class Cache {
  /**
   * Сохранить данные в кеш
   * @param key - ключ для хранения
   * @param data - данные для сохранения
   * @param expiresIn - время жизни кеша в миллисекундах (по умолчанию 5 минут)
   */
  static async set<T>(
    key: string,
    data: T,
    expiresIn: number = 5 * 60 * 1000,
  ): Promise<void> {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiresIn,
      };
      const cacheKey = `${CACHE_PREFIX}${key}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    } catch (error) {
      console.error('❌ Cache set error:', error);
    }
  }

  /**
   * Получить данные из кеша
   * @param key - ключ для получения
   * @returns данные или null если кеш истек или не найден
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      const cached = await AsyncStorage.getItem(cacheKey);

      if (!cached) {
        return null;
      }

      const cacheItem: CacheItem<T> = JSON.parse(cached);
      const age = Date.now() - cacheItem.timestamp;

      // Проверяем, не истек ли кеш
      if (age > cacheItem.expiresIn) {
        await this.remove(key);
        return null;
      }

      return cacheItem.data;
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  /**
   * Удалить данные из кеша
   */
  static async remove(key: string): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('❌ Cache remove error:', error);
    }
  }

  /**
   * Очистить весь кеш
   */
  static async clear(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('❌ Cache clear error:', error);
    }
  }

  /**
   * Получить информацию о размере кеша
   */
  static async getInfo(): Promise<{count: number; keys: string[]}> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));
      return {
        count: cacheKeys.length,
        keys: cacheKeys.map(k => k.replace(CACHE_PREFIX, '')),
      };
    } catch (error) {
      console.error('❌ Cache info error:', error);
      return {count: 0, keys: []};
    }
  }
}

// Константы для времени жизни кеша
export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000, // 2 минуты - часто меняющиеся данные
  MEDIUM: 5 * 60 * 1000, // 5 минут - умеренно меняющиеся
  LONG: 15 * 60 * 1000, // 15 минут - редко меняющиеся
  HALF_HOUR: 30 * 60 * 1000, // 30 минут - activities list
  HOUR: 60 * 60 * 1000, // 1 час - user profile, stats
  DAY: 24 * 60 * 60 * 1000, // 1 день - статические данные
};

