// Утилита для расчета времени в зонах пульса на основе streams данных
import { CACHE_TTL } from './cacheConstants';

/**
 * Получает кэшированные streams данные для активности
 * @param {number} activityId - ID активности
 * @returns {Object|null} - streams данные или null если не найдены/устарели
 */
export const getCachedStreamsData = (activityId) => {
  try {
    const cacheKey = `streams_${activityId}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    const ttl = cacheData.ttl || CACHE_TTL.STREAMS;
    
    // Проверяем TTL
    if (Date.now() - cacheData.timestamp >= ttl) {
      return null; // Кэш устарел
    }
    
    return cacheData.data;
  } catch (error) {
    console.warn(`Error reading streams cache for activity ${activityId}:`, error);
    return null;
  }
};

/**
 * Рассчитывает время в каждой зоне пульса для одной активности
 * @param {number} activityId - ID активности
 * @param {Array} zones - массив зон пульса с min/max значениями
 * @returns {Array} - массив с временем в секундах для каждой зоны
 */
export const calculateActivityHRZones = (activityId, zones) => {
  const streams = getCachedStreamsData(activityId);
  
  if (!streams || !streams.heartrate?.data) {
    return null; // Нет данных streams
  }
  
  const hrData = streams.heartrate.data;
  const zoneTimes = zones.map(() => 0); // Инициализируем массив времени для каждой зоны
  
  // Каждая точка в streams представляет 1 секунду
  for (let i = 0; i < hrData.length; i++) {
    const hr = hrData[i];
    
    if (!hr || hr <= 0) continue; // Пропускаем некорректные данные
    
    // Находим подходящую зону
    for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
      const zone = zones[zoneIndex];
      if (hr >= zone.min && hr < zone.max) {
        zoneTimes[zoneIndex] += 1; // Добавляем 1 секунду
        break;
      }
    }
  }
  
  return zoneTimes;
};

/**
 * Рассчитывает общее время в зонах пульса для массива активностей
 * @param {Array} activities - массив активностей
 * @param {Array} zones - массив зон пульса с min/max значениями
 * @returns {Array} - массив объектов с данными для каждой зоны
 */
export const calculateHRZonesDistribution = (activities, zones) => {
  // Инициализируем результат
  const zoneData = zones.map(zone => ({
    name: zone.name,
    color: zone.color,
    time: 0
  }));
  
  let activitiesWithStreams = 0;
  let activitiesProcessed = 0;
  
  // Обрабатываем каждую активность
  for (const activity of activities) {
    // Пропускаем активности без пульса
    if (!activity.has_heartrate || !activity.average_heartrate) {
      continue;
    }
    
    activitiesProcessed++;
    
    // Пытаемся получить точные данные из streams
    const activityZoneTimes = calculateActivityHRZones(activity.id, zones);
    
    if (activityZoneTimes) {
      // Используем точные данные из streams
      activitiesWithStreams++;
      for (let i = 0; i < zoneData.length; i++) {
        zoneData[i].time += activityZoneTimes[i]; // время в секундах
      }
    } else {
      // Fallback к старому методу (весь moving_time в одну зону по среднему пульсу)
      const avgHR = activity.average_heartrate;
      const movingTime = activity.moving_time || 0;
      
      for (let i = 0; i < zones.length; i++) {
        if (avgHR >= zones[i].min && avgHR < zones[i].max) {
          zoneData[i].time += movingTime; // время в секундах
          break;
        }
      }
    }
  }
  
  // Конвертируем в минуты и фильтруем зоны с нулевым временем
  const result = zoneData
    .map(zone => ({
      ...zone,
      time: +(zone.time / 60).toFixed(1)
    }))
    .filter(zone => zone.time > 0);
  
  // Логируем статистику для отладки
  console.log(`HR Zones calculation: ${activitiesWithStreams}/${activitiesProcessed} activities used streams data`);
  
  return result;
};

/**
 * Загружает streams данные для активностей с пульсом (если еще не загружены)
 * @param {Array} activities - массив активностей
 * @param {number} maxActivities - максимальное количество активностей для загрузки (по умолчанию 20)
 * @returns {Promise<Object>} - статистика загрузки
 */
export const loadStreamsForHRZones = async (activities, maxActivities = 20) => {
  try {
    // Фильтруем только заезды с пульсом
    const ridesWithHR = activities
      .filter(activity => activity.type === 'Ride' && activity.has_heartrate)
      .slice(0, maxActivities); // Ограничиваем количество для производительности
    
    let loadedCount = 0;
    let cachedCount = 0;
    let errorCount = 0;
    
    console.log(`🔄 Загружаем streams данные для HR зон: ${ridesWithHR.length} активностей...`);
    
    for (const activity of ridesWithHR) {
      const cacheKey = `streams_${activity.id}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          const ttl = cacheData.ttl || CACHE_TTL.STREAMS;
          if (Date.now() - cacheData.timestamp < ttl) {
            cachedCount++;
            continue; // Данные актуальны, пропускаем
          }
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      }
      
      // Загружаем данные только если их нет в кэше
      if (!cached) {
        try {
          const { apiFetch } = await import('./api');
          const res = await apiFetch(`/api/activities/${activity.id}/streams`);
          if (res && res.heartrate) {
            const cacheData = {
              data: res,
              timestamp: Date.now(),
              ttl: CACHE_TTL.STREAMS
            };
            
            try {
              localStorage.setItem(cacheKey, JSON.stringify(cacheData));
              loadedCount++;
            } catch (quotaError) {
              if (quotaError.name === 'QuotaExceededError') {
                // Если квота превышена, очищаем старые streams
                console.warn(`⚠️ LocalStorage quota exceeded. Cleaning old streams...`);
                const allKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith('streams_')) {
                    allKeys.push(key);
                  }
                }
                
                // Удаляем старые streams (старше 1 дня)
                let removed = 0;
                for (const key of allKeys) {
                  try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (Date.now() - data.timestamp > 1 * 24 * 60 * 60 * 1000) {
                      localStorage.removeItem(key);
                      removed++;
                    }
                  } catch (e) {
                    localStorage.removeItem(key);
                    removed++;
                  }
                }
                
                // Если удалили менее 10, удаляем все streams
                if (removed < 10) {
                  allKeys.forEach(key => localStorage.removeItem(key));
                  console.log(`🧹 Cleared all ${allKeys.length} streams`);
                }
                
                // Прерываем загрузку - места все равно нет
                console.warn(`⚠️ Stopping HR streams loading due to quota`);
                break;
              }
            }
          }
        } catch (error) {
          // Не логируем 404 ошибки
          if (!error.message?.includes('404') && !error.message?.includes('Resource Not Found')) {
            console.warn(`Failed to load streams for activity ${activity.id}:`, error);
          }
          errorCount++;
        }
      }
    }
    
    console.log(`✅ Streams для HR зон: ${cachedCount} из кэша, ${loadedCount} загружено, ${errorCount} ошибок`);
    
    return {
      total: ridesWithHR.length,
      cached: cachedCount,
      loaded: loadedCount,
      errors: errorCount
    };
  } catch (error) {
    console.error('Error loading streams data for HR zones:', error);
    return { total: 0, cached: 0, loaded: 0, errors: 1 };
  }
};

/**
 * Проверяет, есть ли streams данные для активностей
 * @param {Array} activities - массив активностей
 * @returns {Object} - статистика по наличию streams данных
 */
export const checkStreamsAvailability = (activities) => {
  let total = 0;
  let withStreams = 0;
  let withHeartRate = 0;
  
  for (const activity of activities) {
    if (activity.type === 'Ride' && activity.has_heartrate) {
      withHeartRate++;
      
      const streams = getCachedStreamsData(activity.id);
      if (streams && streams.heartrate?.data) {
        withStreams++;
      }
      total++;
    }
  }
  
  return {
    total,
    withHeartRate,
    withStreams,
    percentage: total > 0 ? Math.round((withStreams / total) * 100) : 0
  };
};
