// Система чек-апа для проверки и оптимизации кэширования
import { CACHE_TTL, CLEANUP_TTL } from './cacheConstants';
import { apiFetch } from './api';
import { jwtDecode } from 'jwt-decode';

// Статусы чек-апа
export const CHECKUP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Типы данных для чек-апа
export const DATA_TYPES = {
  ACTIVITIES: 'activities',
  STREAMS: 'streams',
  GOALS: 'goals',
  WEATHER: 'weather',
  IMAGES: 'images'
};

// Класс для управления чек-апом кэша
export class CacheCheckup {
  constructor() {
    this.status = CHECKUP_STATUS.PENDING;
    this.results = {};
    this.errors = [];
  }

  // Получить userId из токена
  getUserId() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  }

  // Проверить кэш активностей
  async checkActivitiesCache() {
    try {
      const userId = this.getUserId();
      const cacheKey = userId ? `activities_${userId}` : 'activities';
      const cached = localStorage.getItem(`cycleprog_cache_${cacheKey}`);
      
      if (!cached) {
        return {
          status: 'missing',
          message: 'Кэш активностей отсутствует',
          action: 'fetch_from_api'
        };
      }

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;
      const ttl = cacheData.ttl || CACHE_TTL.ACTIVITIES;

      if (age > ttl) {
        return {
          status: 'expired',
          message: `Кэш активностей устарел (${Math.round(age / 60000)} мин)`,
          action: 'refresh_cache'
        };
      }

      return {
        status: 'valid',
        message: `Кэш активностей актуален (${Math.round(age / 60000)} мин)`,
        action: 'use_cache'
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Ошибка проверки кэша активностей: ${error.message}`,
        action: 'clear_and_refetch'
      };
    }
  }

  // Проверить кэш streams данных
  async checkStreamsCache() {
    try {
      const keys = Object.keys(localStorage);
      const streamKeys = keys.filter(key => key.startsWith('streams_'));
      
      if (streamKeys.length === 0) {
        return {
          status: 'missing',
          message: 'Кэш streams данных отсутствует',
          action: 'fetch_when_needed'
        };
      }

      let validCount = 0;
      let expiredCount = 0;
      let errorCount = 0;

      for (const key of streamKeys) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          const age = Date.now() - data.timestamp;
          const ttl = data.ttl || CACHE_TTL.STREAMS;

          if (age > ttl) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }

      return {
        status: 'mixed',
        message: `Streams: ${validCount} актуальных, ${expiredCount} устаревших, ${errorCount} ошибок`,
        action: expiredCount > 0 ? 'cleanup_expired' : 'use_cache',
        details: { validCount, expiredCount, errorCount }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Ошибка проверки кэша streams: ${error.message}`,
        action: 'cleanup_all'
      };
    }
  }

  // Проверить кэш целей
  async checkGoalsCache() {
    try {
      const keys = Object.keys(localStorage);
      const goalKeys = keys.filter(key => key.startsWith('goals_progress_'));
      
      if (goalKeys.length === 0) {
        return {
          status: 'missing',
          message: 'Кэш целей отсутствует',
          action: 'calculate_when_needed'
        };
      }

      let validCount = 0;
      let expiredCount = 0;
      let errorCount = 0;

      for (const key of goalKeys) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          const age = Date.now() - data.timestamp;
          const ttl = CACHE_TTL.GOALS;

          if (age > ttl) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }

      return {
        status: 'mixed',
        message: `Цели: ${validCount} актуальных, ${expiredCount} устаревших, ${errorCount} ошибок`,
        action: expiredCount > 0 ? 'cleanup_expired' : 'use_cache',
        details: { validCount, expiredCount, errorCount }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Ошибка проверки кэша целей: ${error.message}`,
        action: 'cleanup_all'
      };
    }
  }

  // Проверить общий размер кэша
  checkCacheSize() {
    try {
      let totalSize = 0;
      const keys = Object.keys(localStorage);
      
      for (const key of keys) {
        const value = localStorage.getItem(key);
        totalSize += key.length + value.length;
      }

      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      
      return {
        status: totalSize > 50 * 1024 * 1024 ? 'large' : 'normal', // 50MB limit
        message: `Общий размер кэша: ${sizeMB} MB`,
        action: totalSize > 50 * 1024 * 1024 ? 'cleanup_old' : 'monitor',
        details: { totalSize, sizeMB }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Ошибка проверки размера кэша: ${error.message}`,
        action: 'cleanup_all'
      };
    }
  }

  // Выполнить полный чек-ап
  async performFullCheckup() {
    this.status = CHECKUP_STATUS.IN_PROGRESS;
    this.results = {};
    this.errors = [];

    try {
      // console.log('🔍 Начинаем чек-ап кэша...');

      // Проверяем активности
      try {
        this.results.activities = await this.checkActivitiesCache();
        if (this.results.activities && this.results.activities.message) {
          // console.log('📊 Активности:', this.results.activities.message);
        } else {
          console.warn('⚠️ checkActivitiesCache вернул неожиданный результат:', this.results.activities);
          this.results.activities = {
            status: 'error',
            message: 'Ошибка проверки активностей',
            action: 'clear_and_refetch'
          };
        }
      } catch (error) {
        console.error('❌ Ошибка проверки активностей:', error);
        this.results.activities = {
          status: 'error',
          message: `Ошибка проверки активностей: ${error.message}`,
          action: 'clear_and_refetch'
        };
      }

      // Проверяем streams
      try {
        this.results.streams = await this.checkStreamsCache();
        if (this.results.streams && this.results.streams.message) {
          // console.log('📈 Streams:', this.results.streams.message);
        } else {
          console.warn('⚠️ checkStreamsCache вернул неожиданный результат:', this.results.streams);
          this.results.streams = {
            status: 'error',
            message: 'Ошибка проверки streams',
            action: 'cleanup_all'
          };
        }
      } catch (error) {
        console.error('❌ Ошибка проверки streams:', error);
        this.results.streams = {
          status: 'error',
          message: `Ошибка проверки streams: ${error.message}`,
          action: 'cleanup_all'
        };
      }

      // Проверяем цели
      try {
        this.results.goals = await this.checkGoalsCache();
        if (this.results.goals && this.results.goals.message) {
          // console.log('🎯 Цели:', this.results.goals.message);
        } else {
          console.warn('⚠️ checkGoalsCache вернул неожиданный результат:', this.results.goals);
          this.results.goals = {
            status: 'error',
            message: 'Ошибка проверки целей',
            action: 'cleanup_all'
          };
        }
      } catch (error) {
        console.error('❌ Ошибка проверки целей:', error);
        this.results.goals = {
          status: 'error',
          message: `Ошибка проверки целей: ${error.message}`,
          action: 'cleanup_all'
        };
      }

      // Проверяем размер кэша
      try {
        this.results.size = this.checkCacheSize();
        if (this.results.size && this.results.size.message) {
          // console.log('💾 Размер:', this.results.size.message);
        } else {
          console.warn('⚠️ checkCacheSize вернул неожиданный результат:', this.results.size);
          this.results.size = {
            status: 'error',
            message: 'Ошибка проверки размера кэша',
            action: 'cleanup_all'
          };
        }
      } catch (error) {
        console.error('❌ Ошибка проверки размера кэша:', error);
        this.results.size = {
          status: 'error',
          message: `Ошибка проверки размера кэша: ${error.message}`,
          action: 'cleanup_all'
        };
      }

      this.status = CHECKUP_STATUS.COMPLETED;
      // console.log('✅ Чек-ап завершен');

      return this.results;
    } catch (error) {
      this.status = CHECKUP_STATUS.ERROR;
      this.errors.push(error.message);
      console.error('❌ Ошибка чек-апа:', error);
      throw error;
    }
  }

  // Получить рекомендации по оптимизации
  getOptimizationRecommendations() {
    const recommendations = [];

    if (this.results.activities && this.results.activities.action === 'fetch_from_api') {
      recommendations.push({
        type: 'activities',
        priority: 'high',
        action: 'Загрузить активности из API и кэшировать на 30 минут',
        impact: 'Улучшит производительность загрузки страниц'
      });
    }

    if (this.results.streams && this.results.streams.action === 'cleanup_expired') {
      recommendations.push({
        type: 'streams',
        priority: 'medium',
        action: 'Очистить устаревшие streams данные (старше 7 дней)',
        impact: 'Освободит место в localStorage'
      });
    }

    if (this.results.goals && this.results.goals.action === 'cleanup_expired') {
      recommendations.push({
        type: 'goals',
        priority: 'medium',
        action: 'Очистить устаревшие кэши целей (старше 7 дней)',
        impact: 'Освободит место в localStorage'
      });
    }

    if (this.results.size && this.results.size.action === 'cleanup_old') {
      recommendations.push({
        type: 'size',
        priority: 'high',
        action: 'Очистить старые кэши для освобождения места',
        impact: 'Предотвратит ошибки localStorage'
      });
    }

    return recommendations;
  }

  // Выполнить рекомендуемые действия
  async executeRecommendations() {
    const recommendations = this.getOptimizationRecommendations();
    const results = [];

    for (const rec of recommendations) {
      try {
        switch (rec.type) {
          case 'activities':
            if (rec.action.includes('Загрузить')) {
              const userId = this.getUserId();
              const cacheKey = userId ? `activities_${userId}` : 'activities';
              const data = await apiFetch('/api/activities');
              localStorage.setItem(`cycleprog_cache_${cacheKey}`, JSON.stringify({
                data,
                timestamp: Date.now(),
                ttl: CACHE_TTL.ACTIVITIES
              }));
              results.push({ type: 'activities', status: 'success', message: 'Активности загружены и кэшированы' });
            }
            break;

          case 'streams':
            if (rec.action.includes('Очистить')) {
              const keys = Object.keys(localStorage);
              const streamKeys = keys.filter(key => key.startsWith('streams_'));
              let cleaned = 0;
              
              for (const key of streamKeys) {
                try {
                  const data = JSON.parse(localStorage.getItem(key));
                  const age = Date.now() - data.timestamp;
                  const ttl = data.ttl || CACHE_TTL.STREAMS;
                  
                  if (age > ttl) {
                    localStorage.removeItem(key);
                    cleaned++;
                  }
                } catch (e) {
                  localStorage.removeItem(key);
                  cleaned++;
                }
              }
              results.push({ type: 'streams', status: 'success', message: `Очищено ${cleaned} устаревших streams` });
            }
            break;

          case 'goals':
            if (rec.action.includes('Очистить')) {
              const keys = Object.keys(localStorage);
              const goalKeys = keys.filter(key => key.startsWith('goals_progress_'));
              let cleaned = 0;
              
              for (const key of goalKeys) {
                try {
                  const data = JSON.parse(localStorage.getItem(key));
                  const age = Date.now() - data.timestamp;
                  
                  if (age > CACHE_TTL.GOALS) {
                    localStorage.removeItem(key);
                    cleaned++;
                  }
                } catch (e) {
                  localStorage.removeItem(key);
                  cleaned++;
                }
              }
              results.push({ type: 'goals', status: 'success', message: `Очищено ${cleaned} устаревших кэшей целей` });
            }
            break;

          case 'size':
            if (rec.action.includes('Очистить')) {
              // Очищаем все устаревшие кэши
              const keys = Object.keys(localStorage);
              let cleaned = 0;
              
              for (const key of keys) {
                if (key.startsWith('cycleprog_cache_') || key.startsWith('streams_') || key.startsWith('goals_progress_')) {
                  try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const age = Date.now() - data.timestamp;
                    const ttl = data.ttl || CACHE_TTL.ACTIVITIES;
                    
                    if (age > ttl * 2) { // Удаляем кэши старше 2x TTL
                      localStorage.removeItem(key);
                      cleaned++;
                    }
                  } catch (e) {
                    localStorage.removeItem(key);
                    cleaned++;
                  }
                }
              }
              results.push({ type: 'size', status: 'success', message: `Очищено ${cleaned} старых кэшей` });
            }
            break;
        }
      } catch (error) {
        results.push({ type: rec.type, status: 'error', message: error.message });
      }
    }

    return results;
  }
}

// Экспортируем экземпляр для использования
export const cacheCheckup = new CacheCheckup(); 