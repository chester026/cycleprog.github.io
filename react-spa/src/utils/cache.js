// Утилита для кэширования данных в localStorage

const CACHE_PREFIX = 'cycleprog_cache_';
const DEFAULT_TTL = 30 * 60 * 1000; // 30 минут по умолчанию

export const cacheUtils = {
  // Сохранить данные в кэш
  set: (key, data, ttl = DEFAULT_TTL) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        ttl
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Ошибка сохранения в кэш:', error);
    }
  },

  // Получить данные из кэша
  get: (key) => {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const now = Date.now();
      
      // Проверяем, не истек ли срок действия кэша
      if (now - cacheData.timestamp > cacheData.ttl) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.warn('Ошибка чтения из кэша:', error);
      return null;
    }
  },

  // Очистить кэш
  clear: (key) => {
    try {
      if (key) {
        localStorage.removeItem(CACHE_PREFIX + key);
      } else {
        // Очистить все кэши приложения
        Object.keys(localStorage)
          .filter(key => key.startsWith(CACHE_PREFIX))
          .forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.warn('Ошибка очистки кэша:', error);
    }
  },

  // Проверить, есть ли данные в кэше
  has: (key) => {
    return cacheUtils.get(key) !== null;
  },

  // Получить время последнего обновления кэша
  getLastUpdate: (key) => {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      return cacheData.timestamp;
    } catch (error) {
      return null;
    }
  }
};

// Константы для ключей кэша
export const CACHE_KEYS = {
  ACTIVITIES: 'activities',
  LAST_RIDE: 'last_ride',
  GARAGE_IMAGES: 'garage_images',
  WEATHER_DATA: 'weather_data',
  BIKES: 'bikes'
}; 