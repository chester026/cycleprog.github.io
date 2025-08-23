// Общая утилита для кэширования целей
import { analyzeHighIntensityTime } from './vo2max';
import { CACHE_TTL, CLEANUP_TTL } from './cacheConstants';

const GOALS_CACHE_PREFIX = 'goals_progress_v2_'; // v2: добавлено moving_time в хеш

// Функция для создания хеша активностей
export const createActivitiesHash = (activities) => {
  return JSON.stringify(activities.map(a => ({ 
    id: a.id, 
    start_date: a.start_date, 
    distance: a.distance,
    moving_time: a.moving_time // Добавлено для правильного кэширования long_rides
  })));
};

// Функция для загрузки streams данных
export const loadStreamsData = async (activities) => {
  try {
    // console.log(`🔄 Загружаем streams данные для ${activities.length} активностей...`);
    let loadedCount = 0;
    let cachedCount = 0;
    
    for (const act of activities) {
      const cacheKey = `streams_${act.id}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          // Проверяем TTL (7 дней для streams)
          const ttl = cacheData.ttl || CACHE_TTL.STREAMS;
          if (Date.now() - cacheData.timestamp < ttl) {
            cachedCount++;
            continue; // Данные актуальны, пропускаем
          }
        } catch (e) {
          // Если кэш поврежден, удаляем его
          localStorage.removeItem(cacheKey);
        }
      }
      
      if (!cached) {
        try {
          const { apiFetch } = await import('../utils/api');
          const res = await apiFetch(`/api/activities/${act.id}/streams`);
          if (res && res.heartrate) {
            // Сохраняем в кэш на 7 дней
            const cacheData = {
              data: res,
              timestamp: Date.now(),
              ttl: CACHE_TTL.STREAMS // 7 дней
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            loadedCount++;
          }
        } catch (error) {
          console.warn(`Failed to load streams for activity ${act.id}:`, error);
        }
      }
    }
    
    // console.log(`✅ Streams данные: ${cachedCount} из кэша, ${loadedCount} загружено с сервера`);
  } catch (error) {
    console.error('Error loading streams data:', error);
  }
};

// Оптимизированная функция для загрузки стримов только для FTP целей
export const loadStreamsForFTPGoals = async (activities, goal) => {
  try {
    // Фильтруем активности по периоду цели
    let filteredActivities = activities;
    const now = new Date();
    
    if (goal.period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (goal.period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (goal.period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }
    
    // console.log(`🔄 Загружаем streams данные для ${filteredActivities.length} активностей (период: ${goal.period})...`);
    let loadedCount = 0;
    let cachedCount = 0;
    
    for (const act of filteredActivities) {
      const cacheKey = `streams_${act.id}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          // Проверяем TTL (7 дней для streams)
          const ttl = cacheData.ttl || CACHE_TTL.STREAMS;
          if (Date.now() - cacheData.timestamp < ttl) {
            cachedCount++;
            continue; // Данные актуальны, пропускаем
          }
        } catch (e) {
          // Если кэш поврежден, удаляем его
          localStorage.removeItem(cacheKey);
        }
      }
      
      if (!cached) {
        try {
          const { apiFetch } = await import('../utils/api');
          const res = await apiFetch(`/api/activities/${act.id}/streams`);
          if (res && res.heartrate) {
            // Сохраняем в кэш на 7 дней
            const cacheData = {
              data: res,
              timestamp: Date.now(),
              ttl: CACHE_TTL.STREAMS // 7 дней
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            loadedCount++;
          }
        } catch (error) {
          console.warn(`Failed to load streams for activity ${act.id}:`, error);
        }
      }
    }
    
    // console.log(`✅ Streams данные для FTP цели: ${cachedCount} из кэша, ${loadedCount} загружено с сервера`);
  } catch (error) {
    console.error('Error loading streams data for FTP goals:', error);
  }
};

// Функция для расчета прогресса цели
export const calculateGoalProgress = (goal, activities, userProfile = null) => {
  try {
    if (!activities || activities.length === 0) return 0;
    
    // Фильтруем активности по периоду цели
    let filteredActivities = activities;
    const now = new Date();
    
    if (goal.period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (goal.period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (goal.period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }
    
    // Вычисляем прогресс в зависимости от типа цели
    switch (goal.goal_type) {
      case 'distance':
        return filteredActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000; // км
      case 'elevation':
        return filteredActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0); // метры
      case 'time':
        const totalMovingTime = filteredActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0);
        const totalHours = totalMovingTime / 3600;
        return totalHours;
      case 'speed_flat':
        const flatActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation < distance * 0.03;
        });
        if (flatActivities.length === 0) return 0;
        const flatSpeeds = flatActivities.map(a => (a.average_speed || 0) * 3.6);
        const avgSpeed = flatSpeeds.reduce((sum, speed) => sum + speed, 0) / flatSpeeds.length;
        return avgSpeed;
      case 'speed_hills':
        const hillActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation >= distance * 0.025;
        });
        if (hillActivities.length === 0) return 0;
        const hillSpeeds = hillActivities.map(a => (a.average_speed || 0) * 3.6);
        const avgHillSpeed = hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;
        return avgHillSpeed;
      case 'long_rides':
        return filteredActivities.filter(a => 
          (a.distance || 0) > 50000 || 
          (a.moving_time || 0) > 2.5 * 3600
        ).length;
      case 'intervals':
        const intervalActivities = filteredActivities.filter(a => {
          if (a.type === 'Workout' || a.workout_type === 3) return true;
          
          const name = (a.name || '').toLowerCase();
          const intervalKeywords = [
            'интервал', 'interval', 'tempo', 'темпо', 'threshold', 'порог',
            'vo2max', 'vo2', 'анаэробный', 'anaerobic', 'фартлек', 'fartlek',
            'спринт', 'sprint', 'ускорение', 'acceleration', 'повтор', 'repeat',
            'серия', 'series', 'блок', 'block', 'пирамида', 'pyramid'
          ];
          
          if (intervalKeywords.some(keyword => name.includes(keyword))) return true;
          
          if (a.average_speed && a.max_speed) {
            const avgSpeed = a.average_speed * 3.6;
            const maxSpeed = a.max_speed * 3.6;
            const speedVariation = maxSpeed / avgSpeed;
            if (speedVariation > 1.4 && avgSpeed > 25) return true;
          }
          
          return false;
        });
        return intervalActivities.length;
      case 'pulse':
        const pulseActivities = filteredActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
        if (pulseActivities.length === 0) return 0;
        const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
        return totalPulse / pulseActivities.length;
      case 'avg_hr_flat':
        const flatPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation < distance * 0.03 && a.average_heartrate && a.average_heartrate > 0;
        });
        if (flatPulseActivities.length === 0) return 0;
        const flatAvgHR = flatPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / flatPulseActivities.length;
        return Math.round(flatAvgHR);
      case 'avg_hr_hills':
        const hillPulseActivities = filteredActivities.filter(a => {
          const distance = a.distance || 0;
          const elevation = a.total_elevation_gain || 0;
          return distance > 3000 && elevation >= distance * 0.025 && a.average_heartrate && a.average_heartrate > 0;
        });
        if (hillPulseActivities.length === 0) return 0;
        const hillAvgHR = hillPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / hillPulseActivities.length;
        return Math.round(hillAvgHR);
      case 'avg_power':
        const powerActivities = filteredActivities.filter(a => a.distance > 1000);
        

        
        if (powerActivities.length === 0) return 0;
        
        const GRAVITY = 9.81;
        const AIR_DENSITY_SEA_LEVEL = 1.225;
        const CD_A = 0.4;
        const CRR = 0.005;
        
        // Используем данные профиля или значения по умолчанию
        const RIDER_WEIGHT = parseFloat(userProfile?.weight) || 75;
        const BIKE_WEIGHT = parseFloat(userProfile?.bike_weight) || 8;
        
        const calculateAirDensity = (temperature, elevation) => {
          const tempK = temperature ? temperature + 273.15 : 288.15;
          const heightM = elevation || 0;
          const pressureAtHeight = 101325 * Math.exp(-heightM / 7400);
          const R = 287.05;
          return pressureAtHeight / (R * tempK);
        };
        
        const totalWeight = RIDER_WEIGHT + BIKE_WEIGHT;
        

        
        const powerValues = powerActivities.map((activity, index) => {
          const distance = parseFloat(activity.distance) || 0;
          const time = parseFloat(activity.moving_time) || 0;
          const elevationGain = parseFloat(activity.total_elevation_gain) || 0;
          const averageSpeed = parseFloat(activity.average_speed) || 0;
          const temperature = activity.average_temp;
          const maxElevation = activity.elev_high;
          
          const airDensity = calculateAirDensity(temperature, maxElevation);
          
          if (distance <= 0 || time <= 0 || averageSpeed <= 0) return 0;
          
          const averageGrade = elevationGain / distance;
          let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
          const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;
          const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
          
          let totalPower = rollingPower + aeroPower;
          
          if (averageGrade > 0) {
            totalPower += gravityPower;
          } else {
            totalPower += gravityPower;
            const minPowerOnDescent = 20;
            totalPower = Math.max(minPowerOnDescent, totalPower);
          }
          

          
          return isNaN(totalPower) || totalPower < 0 || totalPower > 10000 ? 0 : totalPower;
        }).filter(power => power > 0);
        
        if (powerValues.length === 0) return 0;
        return Math.round(powerValues.reduce((sum, power) => sum + power, 0) / powerValues.length);
      case 'cadence':
        const cadenceActivities = filteredActivities.filter(a => a.average_cadence && a.average_cadence > 0);
        if (cadenceActivities.length === 0) return 0;
        const cadenceValues = cadenceActivities.map(a => a.average_cadence);
        return Math.round(cadenceValues.reduce((sum, cadence) => sum + cadence, 0) / cadenceValues.length);
      case 'ftp_vo2max':
        const hrThreshold = goal.hr_threshold !== null && goal.hr_threshold !== undefined ? goal.hr_threshold : 160;
        const durationThreshold = goal.duration_threshold !== null && goal.duration_threshold !== undefined ? goal.duration_threshold : 120;
        
        const periodDays = goal.period === '4w' ? 28 : 
                          goal.period === '3m' ? 92 : 
                          goal.period === 'year' ? 365 : 28;
        
        const { totalTimeMin, totalIntervals } = analyzeHighIntensityTime(filteredActivities, periodDays, {
          hr_threshold: hrThreshold,
          duration_threshold: durationThreshold
        });
        
        // Возвращаем объект с минутами и интервалами для FTP/VO2max целей
        return {
          minutes: totalTimeMin,
          intervals: totalIntervals
        };
      case 'recovery':
        return filteredActivities.filter(a => a.type === 'Ride' && (a.average_speed || 0) < 20).length;
      default:
        return parseFloat(goal.current_value) || 0;
    }
  } catch (error) {
    console.error('Error in calculateGoalProgress:', error);
    return 0;
  }
};

// Функция для получения кэшированных целей
export const getCachedGoals = (activities, goals) => {
  try {
    const activitiesHash = createActivitiesHash(activities);
    const cacheKey = GOALS_CACHE_PREFIX + activitiesHash;
    const cachedProgress = localStorage.getItem(cacheKey);
    
    if (cachedProgress) {
      const cachedData = JSON.parse(cachedProgress);
      if (Date.now() - cachedData.timestamp < CACHE_TTL.GOALS) {
        return cachedData.goals;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('Error getting cached goals:', error);
    return null;
  }
};

// Функция для сохранения целей в кэш
export const cacheGoals = (activities, goals) => {
  try {
    const activitiesHash = createActivitiesHash(activities);
    const cacheKey = GOALS_CACHE_PREFIX + activitiesHash;
    
    const cacheData = {
      goals: goals,
      timestamp: Date.now()
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Error caching goals:', error);
  }
};

// Функция для очистки старых кэшей
export const cleanupOldGoalsCache = () => {
  try {
    const keys = Object.keys(localStorage);
    const goalCacheKeys = keys.filter(key => key.startsWith(GOALS_CACHE_PREFIX));
    
    const cleanupTime = Date.now() - CLEANUP_TTL.GOALS;
    
    goalCacheKeys.forEach(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.timestamp && data.timestamp < cleanupTime) {
          localStorage.removeItem(key);
        }
      } catch (e) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.warn('Failed to cleanup goals cache:', e);
  }
};

// Функция для принудительной очистки ВСЕХ кэшей целей
export const clearAllGoalsCache = () => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(GOALS_CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    console.log('🧹 Весь кэш целей очищен');
  } catch (e) {
    console.warn('Failed to clear goals cache:', e);
  }
};

// Основная функция для обновления целей с кэшированием
export const updateGoalsWithCache = async (activities, goals, userProfile = null) => {
  try {
    // Очищаем старые кэши
    cleanupOldGoalsCache();
    
    // Проверяем кэш
    const cachedGoals = getCachedGoals(activities, goals);
    if (cachedGoals) {
      return cachedGoals;
    }
    
    // Проверяем, есть ли FTP цели
    const hasFTPGoals = goals.some(goal => goal.goal_type === 'ftp_vo2max');
    
    // Если есть FTP цели, загружаем streams данные
    if (hasFTPGoals) {
      // console.log('🔄 Обнаружены FTP/VO2max цели, загружаем streams данные...');
      await loadStreamsData(activities);
              // console.log('✅ Streams данные загружены для анализа FTP/VO2max');
    } else {
              // console.log('ℹ️ FTP/VO2max цели не обнаружены, пропускаем загрузку streams');
    }
    
    // Рассчитываем прогресс
    const updatedGoals = goals.map(goal => {
      try {
        const currentValue = calculateGoalProgress(goal, activities, userProfile);
        
        // Для FTP/VO2max целей обрабатываем объект с минутами и интервалами
        if (goal.goal_type === 'ftp_vo2max' && typeof currentValue === 'object') {
          return { 
            ...goal, 
            target_value: currentValue.minutes,  // минуты в target_value
            current_value: currentValue.intervals // интервалы в current_value
          };
        }
        
        // Для остальных целей оставляем как есть
        return { ...goal, current_value: currentValue };
      } catch (error) {
        console.error('Error calculating progress for goal:', goal.id, error);
        return { ...goal, current_value: 0 };
      }
    });
    
    // Проверяем, есть ли изменения
    const hasChanges = updatedGoals.some((updatedGoal, index) => {
      const originalGoal = goals[index];
      
      // Для FTP/VO2max целей проверяем и target_value, и current_value
      if (updatedGoal.goal_type === 'ftp_vo2max') {
        return updatedGoal.target_value !== originalGoal.target_value || 
               updatedGoal.current_value !== originalGoal.current_value;
      }
      
      // Для остальных целей проверяем только current_value
      return updatedGoal.current_value !== originalGoal.current_value;
    });
    
    if (hasChanges) {
      // Кэшируем результаты
      cacheGoals(activities, updatedGoals);
      return updatedGoals;
    }
    
    return goals;
  } catch (error) {
    console.error('Error updating goals with cache:', error);
    return goals;
  }
}; 