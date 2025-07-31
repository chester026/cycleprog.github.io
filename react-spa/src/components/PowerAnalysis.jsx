import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import './PowerAnalysis.css';

const PowerAnalysis = ({ activities }) => {
  // Инициализируем значения из localStorage или используем значения по умолчанию
  const [riderWeight, setRiderWeight] = useState(() => {
    const saved = localStorage.getItem('powerAnalysis_riderWeight');
    return saved ? parseFloat(saved) : 75;
  });
  
  const [bikeWeight, setBikeWeight] = useState(() => {
    const saved = localStorage.getItem('powerAnalysis_bikeWeight');
    return saved ? parseFloat(saved) : 8;
  });
  
  const [surfaceType, setSurfaceType] = useState(() => {
    const saved = localStorage.getItem('powerAnalysis_surfaceType');
    return saved || 'asphalt';
  });
  const [powerData, setPowerData] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [windData, setWindData] = useState({}); // кэш данных о ветре
  const [useWindData, setUseWindData] = useState(true); // включить/выключить учет ветра
  const [powerCache, setPowerCache] = useState(() => {
    // Загружаем кэш из localStorage при инициализации
    try {
      const savedCache = localStorage.getItem('powerAnalysisCache');
      const savedVersion = localStorage.getItem('powerAnalysisCacheVersion');
      if (savedCache && savedVersion === 'v1') {
        return JSON.parse(savedCache);
      }
    } catch (error) {
      console.warn('Failed to load power analysis cache from localStorage');
    }
    return {};
  }); // кэш результатов анализа мощности
  const [cacheVersion, setCacheVersion] = useState('v1'); // версия кэша для инвалидации
  const [sortBy, setSortBy] = useState('power'); // 'power' или 'date'

  // Константы для расчетов (по данным Strava)
  const GRAVITY = 9.81; // м/с²
  const AIR_DENSITY_SEA_LEVEL = 1.225; // кг/м³ (стандартная плотность воздуха на уровне моря)
  const CD_A = 0.4; // аэродинамический профиль (усредненное значение Strava)
  
  // Функция для расчета плотности воздуха с учетом температуры и высоты
  const calculateAirDensity = (temperature, elevation) => {
    // Температура в Кельвинах (если передана в Цельсиях)
    const tempK = temperature ? temperature + 273.15 : 288.15; // 15°C по умолчанию
    
    // Высота над уровнем моря в метрах
    const heightM = elevation || 0;
    
    // Формула для расчета плотности воздуха с учетом температуры и высоты
    // Используем барометрическую формулу с учетом температуры
    
    // Атмосферное давление на высоте (барометрическая формула)
    const pressureAtHeight = 101325 * Math.exp(-heightM / 7400); // Па
    
    // Плотность воздуха = давление / (R * температура)
    // R = 287.05 Дж/(кг·К) - газовая постоянная для воздуха
    const R = 287.05;
    const density = pressureAtHeight / (R * tempK);
    
    return density;
  };
  
  // Функции для работы с кэшем
  const getCacheKey = (activityId, riderWeight, bikeWeight, surfaceType, useWindData) => {
    return `${activityId}_${riderWeight}_${bikeWeight}_${surfaceType}_${useWindData ? 'wind' : 'nowind'}_${cacheVersion}`;
  };

  const getCachedPowerData = (activityId, riderWeight, bikeWeight, surfaceType, useWindData) => {
    const cacheKey = getCacheKey(activityId, riderWeight, bikeWeight, surfaceType, useWindData);
    return powerCache[cacheKey];
  };

  const setCachedPowerData = (activityId, riderWeight, bikeWeight, surfaceType, useWindData, data) => {
    const cacheKey = getCacheKey(activityId, riderWeight, bikeWeight, surfaceType, useWindData);
    setPowerCache(prev => {
      const newCache = {
        ...prev,
        [cacheKey]: data
      };
      // Сохраняем в localStorage
      try {
        localStorage.setItem('powerAnalysisCache', JSON.stringify(newCache));
        localStorage.setItem('powerAnalysisCacheVersion', cacheVersion);
      } catch (error) {
        console.warn('Failed to save power analysis cache to localStorage');
      }
      return newCache;
    });
  };

  const clearPowerCache = () => {
    setPowerCache({});
    setCacheVersion(prev => prev === 'v1' ? 'v2' : 'v1');
    // Очищаем localStorage
    try {
      localStorage.removeItem('powerAnalysisCache');
      localStorage.removeItem('powerAnalysisCacheVersion');
    } catch (error) {
      console.warn('Failed to clear power analysis cache from localStorage');
    }
  };

  // Функция для получения данных о ветре для конкретной активности
  const getWindDataForActivity = async (activity) => {
    if (!useWindData) {
      return null;
    }
    
    try {
      const activityDate = new Date(activity.start_date);
      const dateKey = activityDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Проверяем кэш
      if (windData[dateKey]) {
        return windData[dateKey];
      }
      
      // Проверяем, что дата активности в допустимом диапазоне (последние 2 года)
      const now = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      
      // Проверяем, что дата не слишком старая
      if (activityDate < twoYearsAgo) {
        return null;
      }
      
      // Определяем, какой API использовать
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Начало сегодняшнего дня
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      // Сравниваем даты в строковом формате для избежания проблем с часовыми поясами
      const activityDateStr = activityDate.toISOString().split('T')[0];
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];
      
      const useForecastAPI = activityDateStr >= threeDaysAgoStr;
      

      

      
            // Получаем координаты активности (используем средние координаты)
      // В реальном приложении нужно получать координаты из activity.start_latlng
      const lat = 35.1264; // примерные координаты (можно сделать настраиваемыми)
      const lng = 33.4299;
      
      // Небольшая задержка между запросами к API
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Используем наш бэкенд эндпоинт для обхода CORS
      const params = new URLSearchParams({
        latitude: lat,
        longitude: lng,
        start_date: dateKey,
        end_date: dateKey
      });
      
      const apiUrl = `/api/weather/wind?${params}`;
      
      // Получаем данные о ветре с таймаутом
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 секунды таймаут
      
      try {
        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          return null;
        }
        
        const data = await response.json();
      
      if (data.hourly && data.hourly.time) {
        // Находим данные для времени активности
        const activityHour = activityDate.getHours();
        
        let hourIndex;
        if (useForecastAPI) {
          // Для прогнозного API ищем точное совпадение даты и часа
          hourIndex = data.hourly.time.findIndex(time => {
            const timeDate = new Date(time);
            const timeDateStr = timeDate.toISOString().split('T')[0];
            const timeHour = timeDate.getHours();
            
            return timeDateStr === dateKey && timeHour === activityHour;
          });
        } else {
          // Для архивного API ищем только по часу (дата уже задана)
          hourIndex = data.hourly.time.findIndex(time => 
            new Date(time).getHours() === activityHour
          );
        }
        
        if (hourIndex !== -1) {
          const windSpeed = data.hourly.windspeed_10m[hourIndex];
          const windDirection = data.hourly.winddirection_10m[hourIndex];
          

          
          const windInfo = {
            speed: windSpeed, // м/с
            direction: windDirection, // градусы
            date: dateKey
          };
          
          // Кэшируем данные
          setWindData(prev => ({
            ...prev,
            [dateKey]: windInfo
          }));
          
          if (windSpeed === null || windDirection === null) {
            return null;
          }
          
          return windInfo;
        }
      }
      
      return null;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        return null;
      }
    } catch (error) {
      // Тихая обработка ошибок - не показываем в консоли
      return null;
    }
  };
  
  // Коэффициенты сопротивления качению для разных покрытий
  const CRR_VALUES = {
    asphalt: 0.005,      // Асфальт, хорошие шины
    concrete: 0.006,     // Бетон
    gravel: 0.012,       // Гравий
    dirt: 0.015,         // Грунт
    mountain: 0.020      // Горный велосипед
  };

  // Функция для расчета мощности по формулам Strava с учетом ветра
  const calculatePower = async (activity) => {
    if (!activity || !activity.distance || !activity.moving_time || !activity.total_elevation_gain) {
      return null;
    }

    // Проверяем кэш
    const cachedData = getCachedPowerData(activity.id, riderWeight, bikeWeight, surfaceType, useWindData);
    if (cachedData) {
      return cachedData;
    }

    // Проверяем, есть ли реальные данные мощности
    const hasRealPower = activity.average_watts && activity.max_watts;

    const totalWeight = riderWeight + bikeWeight; // кг
    const distance = parseFloat(activity.distance) || 0; // метры
    const time = parseFloat(activity.moving_time) || 0; // секунды
    const elevationGain = parseFloat(activity.total_elevation_gain) || 0; // метры
    const averageSpeed = parseFloat(activity.average_speed) || 0; // м/с
    
    // Получаем данные о температуре и высоте
    const temperature = activity.average_temp; // °C
    const maxElevation = activity.elev_high; // максимальная высота в метрах
    
    // Рассчитываем плотность воздуха с учетом температуры и высоты
    const airDensity = calculateAirDensity(temperature, maxElevation);

    // Проверяем, что у нас есть все необходимые данные
    if (distance <= 0 || time <= 0 || averageSpeed <= 0) {
      return null;
    }

    // Рассчитываем средний уклон
    // Для спусков elevationGain может быть небольшим, но реальный уклон отрицательный
    let averageGrade = elevationGain / distance;
    
    // Если это явно спуск (высокая скорость, низкий набор высоты), корректируем уклон
    const speedKmh = averageSpeed * 3.6;
    const distanceKm = distance / 1000;
    
    // Если скорость высокая (>25 км/ч) и набор высоты низкий относительно дистанции,
    // то это скорее всего спуск
    if (speedKmh > 25 && elevationGain < distanceKm * 50) {
      // Оцениваем уклон спуска на основе скорости и сопротивления
      // Чем выше скорость, тем круче спуск
      const estimatedDescentGrade = -(speedKmh - 20) / 10; // примерная оценка
      averageGrade = Math.max(-0.15, estimatedDescentGrade); // максимум -15%
    }

    // 2. Сопротивление качению
    const crr = CRR_VALUES[surfaceType];
    const rollingPower = crr * totalWeight * GRAVITY * averageSpeed;

    // Получаем данные о ветре
    const windInfo = await getWindDataForActivity(activity);
    
    // 3. Аэродинамическое сопротивление с учетом ветра
    let aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
    let windEffect = 0;
    let windPower = 0;
    
    if (windInfo && windInfo.speed > 0) {
      // Рассчитываем эффективную скорость с учетом ветра
      const windSpeed = windInfo.speed; // м/с
      const windDirection = windInfo.direction; // градусы
      
      // Упрощенный расчет: считаем, что ветер либо попутный, либо встречный
      // Для более точного расчета нужно знать направление движения велосипеда
      // Пока используем упрощенную модель: ветер либо помогает, либо мешает
      
      // Более консервативный расчет влияния ветра
      // Ограничиваем влияние ветра разумными пределами
      const maxWindEffect = Math.min(windSpeed, 5); // максимальное влияние ветра = 5 м/с
      const windEffectMultiplier = 0.3; // коэффициент влияния ветра (30%)
      
      // Рассчитываем эффективную скорость с ограниченным влиянием ветра
      const effectiveSpeed = averageSpeed + (maxWindEffect * windEffectMultiplier);
      
      // Пересчитываем аэродинамическое сопротивление с учетом ветра
      const aeroPowerWithWind = 0.5 * airDensity * CD_A * Math.pow(effectiveSpeed, 3);
      windPower = aeroPowerWithWind - aeroPower;
      windEffect = windPower;
      
      // Обновляем аэродинамическое сопротивление
      aeroPower = aeroPowerWithWind;
    }

    // 1. Гравитационная сила (вес + уклон)
    // На подъеме - сопротивление (положительная мощность), на спуске - помощь (отрицательная мощность)
    let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
    
    // Для спусков ограничиваем гравитационную помощь
    // На крутых спусках гравитация не может полностью компенсировать сопротивление
    if (averageGrade < 0) {
      const maxAssistance = rollingPower + aeroPower; // максимальная помощь = сопротивление
      gravityPower = Math.max(-maxAssistance, gravityPower);
    }

    // 4. Общая мощность
    // На спуске гравитация помогает (отрицательная), поэтому общая мощность меньше
    let totalPower = rollingPower + aeroPower + gravityPower;
    
    // На спуске мощность не может быть меньше минимальной (просто поддержание равновесия)
    if (averageGrade < 0) {
      const minPowerOnDescent = 20; // минимальная мощность на спуске
      totalPower = Math.max(minPowerOnDescent, totalPower);
    }

    // Проверяем, что мощность получилась разумной
    if (isNaN(totalPower) || totalPower < 0 || totalPower > 2000) {
      // Если мощность слишком высокая, пересчитываем без учета ветра
      if (windInfo && windInfo.speed > 0) {
        // Пересчитываем только базовое аэродинамическое сопротивление
        const baseAeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
        totalPower = rollingPower + baseAeroPower + gravityPower;
        
        // Если все еще слишком высоко, возвращаем null
        if (totalPower > 2000) {
          return null;
        }
        
        // Обновляем результат без влияния ветра
        aeroPower = baseAeroPower;
        windPower = 0;
      } else {
        return null;
      }
    }

    const result = {
      total: Math.round(totalPower),
      gravity: Math.round(gravityPower),
      gravityType: averageGrade > 0 ? 'resistance' : 'assistance', // тип гравитационной силы
      rolling: Math.round(rollingPower),
      aero: Math.round(aeroPower),
      wind: Math.round(windPower), // влияние ветра
      windSpeed: windInfo ? windInfo.speed : null, // скорость ветра (м/с)
      windDirection: windInfo ? windInfo.direction : null, // направление ветра (градусы)
      effectiveSpeed: windInfo && windInfo.speed > 0 ? (averageSpeed + (Math.min(windInfo.speed, 5) * 0.3)) * 3.6 : null, // эффективная скорость в км/ч
      airDensity: airDensity.toFixed(3), // плотность воздуха (кг/м³)
      temperature: temperature, // температура (°C)
      maxElevation: maxElevation, // максимальная высота (м)
      grade: (averageGrade * 100).toFixed(1), // уклон в процентах
      speed: (averageSpeed * 3.6).toFixed(1), // скорость в км/ч
      distance: (distance / 1000).toFixed(1), // дистанция в км
      time: Math.round(time / 60), // время в минутах
      elevation: Math.round(elevationGain), // набор высоты в метрах
                  date: new Date(activity.start_date).toLocaleDateString('ru-RU', { 
              month: 'numeric', 
              day: 'numeric', 
              year: '2-digit' 
            }),
      name: activity.name,
      hasRealPower,
      realAvgPower: hasRealPower ? activity.average_watts : null,
      realMaxPower: hasRealPower ? activity.max_watts : null,
      accuracy: hasRealPower ? Math.round((Math.abs(totalPower - activity.average_watts) / activity.average_watts) * 100) : null
    };

    // Сохраняем результат в кэш
    setCachedPowerData(activity.id, riderWeight, bikeWeight, surfaceType, useWindData, result);

    return result;
  };

  // Функция для анализа всех активностей
    const analyzeActivities = async () => {
    if (!activities || activities.length === 0) {
      setLoading(false);
      setPowerData([]);
      return;
    }
    
    setLoading(true);
    
    try {
      // Фильтруем активности за последние 2 года
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      
      const filteredActivities = activities.filter(activity => {
        if (!activity || activity.distance <= 1000) return false;
        if (activity.type !== 'Ride') return false; // Только велосипедные заезды
        
        const activityDate = new Date(activity.start_date);
        return activityDate >= twoYearsAgo;
      });
      
      // Проверяем, есть ли активности после фильтрации
      if (filteredActivities.length === 0) {
        setPowerData([]);
        setLoading(false);
        return;
      }
      
      // Ограничиваем количество активностей для анализа (максимум 50)
      const limitedActivities = filteredActivities.slice(0, 50);
      
      // Устанавливаем общее количество для прогресса
      setLoadingProgress({ current: 0, total: limitedActivities.length });
      
      // Последовательно рассчитываем мощность для каждой активности
      // Это предотвращает перегрузку API запросами ветра
      const powerResults = [];
      for (let i = 0; i < limitedActivities.length; i++) {
        const activity = limitedActivities[i];
        
        // Обновляем прогресс
        setLoadingProgress({ current: i + 1, total: limitedActivities.length });
        try {
          // Добавляем таймаут для каждой активности (3 секунды)
          const power = await Promise.race([
            calculatePower(activity),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 3000)
            )
          ]);
          
          if (power) {
            powerResults.push({
              ...power,
              id: activity.id,
              originalActivity: activity
            });
          }
        } catch (error) {
          // Тихая обработка ошибок расчета мощности
          continue;
        }
      }
      
      // Фильтруем результаты и сортируем (старые первыми для графика)
      const analyzedData = powerResults
        .filter(Boolean)
        .sort((a, b) => new Date(a.originalActivity.start_date) - new Date(b.originalActivity.start_date));

      setPowerData(analyzedData);
      
      // Выбираем по умолчанию самую новую активность из топ-30 по мощности
      const top30 = [...analyzedData].sort((a, b) => b.total - a.total).slice(0, 30);
      if (top30.length > 0) {
        // Берем самую новую активность из топ-30 (последнюю в отсортированном массиве)
        const newestFromTop30 = top30.sort((a, b) => new Date(b.originalActivity.start_date) - new Date(a.originalActivity.start_date))[0];
        setSelectedActivity(newestFromTop30);
      }
    
    } catch (error) {
      // Тихая обработка ошибок анализа активностей
      setPowerData([]);
    } finally {
      setLoading(false);
    }
  };

  // Функция для расчета статистик
  const calculateStats = () => {
    if (!powerData || powerData.length === 0) return null;

    try {
      const powers = powerData.map(d => d.total);
    const avgPower = Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);

    // Находим лучшие результаты по мощности или дате
    const bestByPower = [...powerData]
      .sort((a, b) => {
        if (sortBy === 'date') {
          const dateA = new Date(a.originalActivity.start_date);
          const dateB = new Date(b.originalActivity.start_date);
  
          return dateB - dateA; // Новые даты вверху
        }
        return b.total - a.total;
      })
      .slice(0, 30);



    // Находим лучшие результаты по средней мощности (мощность/время)
    const bestByAvgPower = [...powerData]
      .map(d => ({ ...d, avgPower: Math.round(d.total / (d.time / 60)) }))
      .sort((a, b) => b.avgPower - a.avgPower)
      .slice(0, 5);



    // Статистика по точности расчетов (если есть реальные данные)
    const activitiesWithRealPower = powerData.filter(d => d.hasRealPower);
    const avgAccuracy = activitiesWithRealPower.length > 0 
      ? Math.round(activitiesWithRealPower.reduce((sum, d) => sum + d.accuracy, 0) / activitiesWithRealPower.length)
      : null;

    // Статистика по активностям с данными о ветре
    const activitiesWithWindData = powerData.filter(d => d.windSpeed !== null && d.windSpeed !== undefined);

    return {
      avgPower,
      maxPower,
      minPower,
      totalActivities: powerData.length,
      activitiesWithRealPower: activitiesWithRealPower.length,
      activitiesWithWindData: activitiesWithWindData.length,
      avgAccuracy,
      bestByPower,
      bestByAvgPower,
      cacheSize: Object.keys(powerCache).length
    };
    } catch (error) {
      // Тихая обработка ошибок расчета статистики
      return null;
    }
  };

  // Функция для форматирования времени
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;
  };

  // Custom tooltip для графика
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="power-tooltip">
          <p className="tooltip-title">{data.name}</p>
          <p className="tooltip-date">{data.date}</p>
          <p className="tooltip-power">Power: <strong>{data.total} W</strong></p>
          <p className="tooltip-details">
            Speed: {data.speed} km/h<br/>
            Grade: {data.grade}%<br/>
            Distance: {data.distance} km<br/>
            Time: {formatTime(data.time)}
          </p>
          <div className="tooltip-breakdown">
            <span>
              Gravity: {data.gravity} W 
              {data.gravityType === 'assistance' ? ' (assistance)' : ' (resistance)'}
            </span>
            <span>Rolling: {data.rolling} W</span>
            <span>Aero: {data.aero} W</span>
            {data.wind !== undefined && data.wind !== 0 && (
              <span style={{ color: data.wind > 0 ? '#ef4444' : '#10b981' }}>
                Wind: {data.wind > 0 ? '+' : ''}{data.wind} W
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    if (activities && activities.length > 0) {
      // Очищаем кэш ветра при отключении функции
      if (!useWindData) {
        setWindData({});
      }
      // НЕ очищаем кэш мощности при изменении параметров - кэш будет работать с новыми ключами
      analyzeActivities();
    }
  }, [activities, riderWeight, bikeWeight, surfaceType, useWindData, sortBy]);





  const stats = React.useMemo(() => calculateStats(), [powerData, sortBy]);

  return (
    <div className="power-analysis">
      <div className="power-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent:'space-between' }}>
          <h3 style={{ color: '#f6f8ff', margin: 0}}></h3>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="settings-btn"
            title="Настройки"
            style={{ marginLeft: 12 }}
          >
            Settings
          </button>
        </div>
        
       
      </div>

      {/* Parameters */}
      {showSettings && (
        <div className="power-params">
          <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
          <div className="param-group">
          <label>Rider Weight (kg):</label>
          <input
            type="text"
            value={riderWeight}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              setRiderWeight(value);
              localStorage.setItem('powerAnalysis_riderWeight', value.toString());
            }}
            onFocus={(e) => e.target.select()}

            placeholder="75 (40-200)"
            style={{ width: '80px' }}
          />
        </div>
        <div className="param-group">
          <label>Bike Weight (kg):</label>
                    <input
            type="number"
            step="0.1"
            min="5"
            max="30"
            value={bikeWeight}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              setBikeWeight(value);
              localStorage.setItem('powerAnalysis_bikeWeight', value.toString());
            }}
            onFocus={(e) => e.target.select()}
            placeholder="8.0"
            style={{ width: '80px' }}
          />
        </div>
        <div className="param-group">
          <label>Surface Type:</label>
          <select
            value={surfaceType}
            onChange={(e) => {
              setSurfaceType(e.target.value);
              localStorage.setItem('powerAnalysis_surfaceType', e.target.value);
            }}
            
          >
            <option value="asphalt">Asphalt</option>
            <option value="concrete">Concrete</option>
            <option value="gravel">Gravel</option>
            <option value="dirt">Dirt</option>
            <option value="mountain">Mountain Bike</option>
          </select>
        </div>
          </div>
       
        <div className="param-group">
          <label>Include Wind Data:</label>
          <div style={{ display: 'flex', alignItems: 'center'}}>
            <input
              type="checkbox"
              checked={useWindData}
              onChange={(e) => setUseWindData(e.target.checked)}
              style={{ minWidth: '16px', margin:'0'}}
            />
            <span style={{ marginLeft: 8, fontSize: '0.9em', color: '#b0b8c9' }}>
              Use weather API for wind calculations (via backend proxy, last 2 years, max 50 activities)
            </span>
          </div>
          
        </div>
        <div className="param-info">
          <small>
            Total Weight: <strong>{(riderWeight + bikeWeight).toFixed(1)} kg</strong> (Rider: {riderWeight}, Bike: {bikeWeight.toFixed(1)})<br/>
            CdA: {CD_A} | Crr: {CRR_VALUES[surfaceType]} | Air Density: Dynamic (temp/elevation)<br/>
            Wind Data: {useWindData ? 'Enabled (via backend proxy, last 2 years, max 50 activities)' : 'Disabled'}
          </small>
          <div style={{ marginTop: 8 }}>
            <button 
              onClick={clearPowerCache}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                background: '#374151',
                border: '1px solid #4b5563',
                color: '#d1d5db',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="Clear power analysis cache"
            >
              Clear Cache ({Object.keys(powerCache).length} items)
            </button>
          </div>
        </div>
      </div>
      )}

      {loading && (
        <div className="power-loading">
          Analyzing activities... {loadingProgress.current > 0 && (
            <span style={{ fontSize: '0.9em', color: '#b0b8c9' }}>
              ({loadingProgress.current}/{loadingProgress.total})
            </span>
          )}
        </div>
      )}

      {stats && (
        <div className="power-stats">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.avgPower}</div>
              <div className="stat-label">Average Power (W)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.maxPower}</div>
              <div className="stat-label">Maximum Power (W)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.minPower}</div>
              <div className="stat-label">Minimum Power (W)</div>
            </div>
                        <div className="stat-card">
              <div className="stat-value">{stats.totalActivities}</div>
              <div className="stat-label">Activities Analyzed</div>
            </div>
           
            {stats.avgAccuracy && (
              <div className="stat-card" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
                <div className="stat-value">±{stats.avgAccuracy}%</div>
                <div className="stat-label">Average Accuracy ({stats.activitiesWithRealPower} with power meter)</div>
              </div>
            )}
           
          </div>
        </div>
      )}

      {/* Power Chart */}
      {powerData.length > 0 && (
        <div className="power-chart">
                     <div style={{ 
           marginTop: '40px',
           marginBottom: '40px', 
           padding: '8px 12px', 
           background: '#23272f', 
           border: '1px solid #7eaaff', 
          
           fontSize: '14px',
           color: '#b0b8c9'
         }}>
           <strong>Note:</strong> These are estimated values. Accuracy depends on GPS data quality, 
           road profile and selected parameters. Wind data is fetched via backend proxy (last 2 years, max 50 activities). 
           For accurate measurements use a power meter.
         </div>
         
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={powerData}>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
              <YAxis 
                tick={{ fontSize: 13, fill: '#b0b8c9' }}
                axisLine={{ stroke: '#444' }}
                tickLine={false}
                label={{ value: 'Power (W)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#b0b8c9' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#7eaaff"
                strokeWidth={3}
                fill="url(#powerGradient)"
                fillOpacity={0.4}
                onClick={(data) => {
                  const activity = powerData.find(d => d.id === data.id);
                  if (activity) {
                    setSelectedActivity(activity);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7eaaff" stopOpacity={0.32}/>
                  <stop offset="100%" stopColor="#7eaaff" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Best Results */}
      {stats && (
        <div className="power-best">
          <div className="best-section">
            <div className="best-header">
              <h4>{sortBy === 'power' ? 'Maximum Power Top' : 'Recent Activities'}</h4>
              <div className="sort-buttons">
                <button 
                  className={`sort-btn ${sortBy === 'power' ? 'active' : ''}`}
                  onClick={() => setSortBy('power')}
                >
                  Power
                </button>
                <button 
                  className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
                  onClick={() => setSortBy('date')}
                >
                  Date
                </button>
              </div>
            </div>
            <div className="best-list">
              {stats.bestByPower.map((activity, index) => (
                 <div 
                   key={activity.id} 
                   className="best-item"
                   onClick={() => setSelectedActivity(activity)}
                   style={{ cursor: 'pointer' }}
                 >
                  {sortBy === 'power' && (
                    <div className="best-rank">
                      #{index + 1}
                    </div>
                  )}
                  <div className="best-info">
                    <div className="best-name">{activity.name}</div>
                    <div className="best-details">
                      {activity.date} • {activity.distance} км • {formatTime(activity.time)}
                    </div>
                  </div>
                  <div className="best-power">
                    {activity.total} W
                  </div>
                </div>
              ))}
            </div>
          </div>
  {/* Detailed Analysis of Selected Activity */}
  {selectedActivity ? (
        <div className="detailed-analysis">
          <h4>{selectedActivity.name}</h4>
          <div className="analysis-grid">
            <div className="analysis-item">
              <div className="analysis-label">Estimated Power:</div>
              <div className="analysis-value">{selectedActivity.total} W</div>
            </div>
            <div className="analysis-item">
              <div className="analysis-label">Average Power (W/min):</div>
              <div className="analysis-value">{Math.round(selectedActivity.total / (selectedActivity.time / 60))} W/min</div>
            </div>
              {selectedActivity.hasRealPower && (
                <>
                  <div className="analysis-item">
                    <div className="analysis-label">Real Average Power:</div>
                    <div className="analysis-value" style={{ color: '#10b981' }}>{selectedActivity.realAvgPower} W</div>
                  </div>
                  <div className="analysis-item">
                    <div className="analysis-label">Real Maximum Power:</div>
                    <div className="analysis-value" style={{ color: '#10b981' }}>{selectedActivity.realMaxPower} W</div>
                  </div>
                  <div className="analysis-item">
                    <div className="analysis-label">Calculation Accuracy:</div>
                    <div className="analysis-value" style={{ 
                      color: selectedActivity.accuracy <= 10 ? '#10b981' : 
                             selectedActivity.accuracy <= 20 ? '#f59e0b' : '#ef4444'
                    }}>
                      ±{selectedActivity.accuracy}%
                    </div>
                  </div>
                </>
              )}
            <div className="analysis-item">
              <div className="analysis-label">
                Gravitational Force ({selectedActivity.gravityType === 'assistance' ? 'assistance' : 'resistance'}):
              </div>
              
              <div className="analysis-value" style={{ 
                color: selectedActivity.gravityType === 'assistance' ? '#10b981' : '#ef4444'
              }}>
                {selectedActivity.gravity} W
              </div>
            </div>
            
            <div className="analysis-item">
              <div className="analysis-label">Rolling Resistance:</div>
              <div className="analysis-value">{selectedActivity.rolling} W</div>
            </div>
            {selectedActivity.wind !== undefined && selectedActivity.wind !== 0 && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Effect:</div>
                <div className="analysis-value" style={{ 
                  color: selectedActivity.wind > 0 ? '#ef4444' : '#10b981'
                }}>
                  {selectedActivity.wind > 0 ? '+' : ''}{selectedActivity.wind} W
                </div>
              </div>
            )}
            <div className="analysis-item">
              <div className="analysis-label">Aerodynamic Resistance:</div>
              <div className="analysis-value">{selectedActivity.aero} W</div>
            </div>
            
            {selectedActivity.windSpeed && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Speed:</div>
                <div className="analysis-value">{selectedActivity.windSpeed} m/s</div>
              </div>
            )}
            {selectedActivity.effectiveSpeed && (
              <div className="analysis-item">
                <div className="analysis-label">Effective Speed (with wind):</div>
                <div className="analysis-value">{selectedActivity.effectiveSpeed.toFixed(1)} km/h</div>
              </div>
            )}
           
            <div className="analysis-item">
              <div className="analysis-label">Average Grade:</div>
              <div className="analysis-value">{selectedActivity.grade}%</div>
            </div>
            {selectedActivity.windDirection && (
              <div className="analysis-item">
                <div className="analysis-label">Wind Direction:</div>
                <div className="analysis-value">{selectedActivity.windDirection}°</div>
              </div>
            )}
            <div className="analysis-item">
              <div className="analysis-label">Average Speed:</div>
              <div className="analysis-value">{selectedActivity.speed} km/h</div>
            </div>
            {selectedActivity.temperature && (
              <div className="analysis-item">
                <div className="analysis-label">Temperature:</div>
                <div className="analysis-value">{selectedActivity.temperature}°C</div>
              </div>
            )}
            {selectedActivity.maxElevation && (
              <div className="analysis-item">
                <div className="analysis-label">Max Elevation:</div>
                <div className="analysis-value">{selectedActivity.maxElevation} m</div>
              </div>
            )}
            <div className="analysis-item">
              <div className="analysis-label">Air Density:</div>
              <div className="analysis-value">{selectedActivity.airDensity} kg/m³</div>
            </div>
                      </div>
          </div>
        ) : (
          <div className="detailed-analysis">
            <div style={{ marginBottom: '16px' }}>
              <h4>Detailed Analysis</h4>
            </div>
            <div style={{ color: '#b0b8c9', textAlign: 'center', padding: '40px' }}>
              Loading data...
            </div>
          </div>
        )}
        
        </div>
      )}

    
    </div>
  );
};

export default PowerAnalysis; 