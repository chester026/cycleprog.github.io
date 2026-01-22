import React, {useEffect, useMemo, useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {LineChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {apiFetch} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const screenWidth = Dimensions.get('window').width;

interface PowerAnalysisProps {
  activities: any[];
  onStatsCalculated?: (stats: PowerStats) => void;
}

interface PowerStats {
  avgPower: number;
  maxPower: number;
  minPower: number;
  totalActivities: number;
  activitiesWithWindData?: number;
  activitiesWithRealPower?: number;
}

interface PowerDataItem {
  id: string;
  name: string;
  date: string;
  total: number;
  hasRealPower: boolean;
  distance: number;
  time: number;
  windSpeed?: number | null;
  windDirection?: number | null;
  temperature?: number | null;
  gravity?: number;
  gravityType?: 'resistance' | 'assistance';
  rolling?: number;
  aero?: number;
  wind?: number;
  effectiveSpeed?: number | null;
  airDensity?: string;
  grade?: string;
  speed?: string;
  elevation?: number;
}

interface WindDataCache {
  [dateKey: string]: {
    speed: number;
    direction: number;
    date: string;
  };
}

interface PowerCacheItem {
  data: PowerDataItem;
  timestamp: number;
}

export const PowerAnalysis: React.FC<PowerAnalysisProps> = ({activities, onStatsCalculated}) => {
  const [powerData, setPowerData] = useState<PowerDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const hapticTriggeredRef = useRef<number | null>(null);

  // Параметры (будут загружены из профиля)
  const [riderWeight, setRiderWeight] = useState(75);
  const [bikeWeight, setBikeWeight] = useState(8);
  const [surfaceType] = useState('asphalt'); // asphalt, gravel, dirt, etc.
  const [useWindData, setUseWindData] = useState(true); // Включить/выключить учет ветра

  // Кеш для данных о ветре и мощности
  const [windDataCache, setWindDataCache] = useState<WindDataCache>({});
  const [powerCache, setPowerCache] = useState<{[key: string]: PowerCacheItem}>({});

  // Константы для расчетов
  const GRAVITY = 9.81;
  const CD_A = 0.4;
  
  // Коэффициенты сопротивления качению для разных покрытий
  const CRR_VALUES: {[key: string]: number} = {
    asphalt: 0.005,
    concrete: 0.006,
    gravel: 0.012,
    dirt: 0.015,
    mountain: 0.020,
  };
  
  const CRR = CRR_VALUES[surfaceType] || 0.005;

  // Загружаем кеш из AsyncStorage при инициализации
  useEffect(() => {
    const loadCache = async () => {
      try {
        const [savedWindCache, savedPowerCache] = await Promise.all([
          AsyncStorage.getItem('powerAnalysis_windCache'),
          AsyncStorage.getItem('powerAnalysis_powerCache'),
        ]);

        if (savedWindCache) {
          setWindDataCache(JSON.parse(savedWindCache));
        }
        if (savedPowerCache) {
          setPowerCache(JSON.parse(savedPowerCache));
        }
      } catch (error) {
        console.warn('Failed to load power analysis cache:', error);
      }
    };
    loadCache();
  }, []);

  // Сохраняем кеш в AsyncStorage при изменении
  useEffect(() => {
    const saveCache = async () => {
      try {
        await Promise.all([
          AsyncStorage.setItem('powerAnalysis_windCache', JSON.stringify(windDataCache)),
          AsyncStorage.setItem('powerAnalysis_powerCache', JSON.stringify(powerCache)),
        ]);
      } catch (error) {
        console.warn('Failed to save power analysis cache:', error);
      }
    };
    saveCache();
  }, [windDataCache, powerCache]);

  // Загружаем профиль пользователя и обновляем веса
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
        
        // Обновляем веса из профиля, если они есть
        if (profile.weight) {
          const weight = parseFloat(profile.weight);
          if (!isNaN(weight) && weight > 0) {
            setRiderWeight(weight);
          }
        }
        if (profile.bike_weight) {
          const weight = parseFloat(profile.bike_weight);
          if (!isNaN(weight) && weight > 0) {
            setBikeWeight(weight);
          }
        }
      } catch (error) {
        console.error('Error loading user profile for power analysis:', error);
      }
    };
    loadUserProfile();
  }, []);

  // Функция расчета плотности воздуха
  const calculateAirDensity = (temperature?: number, elevation?: number) => {
    const tempK = temperature ? temperature + 273.15 : 288.15;
    const heightM = elevation || 0;
    const pressureAtHeight = 101325 * Math.exp(-heightM / 7400);
    const R = 287.05;
    return pressureAtHeight / (R * tempK);
  };

  // Функция для получения данных о ветре для конкретной активности
  const getWindDataForActivity = async (activity: any): Promise<{speed: number; direction: number; date: string} | null> => {
    if (!useWindData) {
      return null;
    }

    try {
      const activityDate = new Date(activity.start_date);
      const dateKey = activityDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Проверяем кеш
      if (windDataCache[dateKey]) {
        return windDataCache[dateKey];
      }

      // Проверяем, что дата активности в допустимом диапазоне (последние 2 года)
      const now = new Date();
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      if (activityDate < twoYearsAgo) {
        return null;
      }

      // Определяем, какой API используется на бэкенде
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Начало сегодняшнего дня
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Сравниваем даты в строковом формате для избежания проблем с часовыми поясами
      const activityDateStr = activityDate.toISOString().split('T')[0];
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

      const useForecastAPI = activityDateStr >= threeDaysAgoStr;

      // Получаем координаты активности
      let lat, lng;

      if (activity.start_latlng && activity.start_latlng.length === 2) {
        lat = activity.start_latlng[0];
        lng = activity.start_latlng[1];
      } else if (activity.end_latlng && activity.end_latlng.length === 2) {
        lat = activity.end_latlng[0];
        lng = activity.end_latlng[1];
      } else {
        // Координаты по умолчанию (Кипр)
        lat = 35.1264;
        lng = 33.4299;
      }

      // Небольшая задержка между запросами
      await new Promise<void>(resolve => setTimeout(() => resolve(), 100));

      // Запрос к API через бэкенд
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        start_date: dateKey,
        end_date: dateKey,
      });

      const apiUrl = `/api/weather/wind?${params}`;

      // Таймаут 2 секунды
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await apiFetch(apiUrl);
        clearTimeout(timeoutId);

        if (!response || !response.hourly || !response.hourly.time) {
          return null;
        }

        // Находим данные для времени активности
        const activityHour = activityDate.getHours();
        
        let hourIndex;
        if (useForecastAPI) {
          // Для прогнозного API ищем точное совпадение даты и часа
          hourIndex = response.hourly.time.findIndex((time: string) => {
            const timeDate = new Date(time);
            const timeDateStr = timeDate.toISOString().split('T')[0];
            const timeHour = timeDate.getHours();
            
            return timeDateStr === dateKey && timeHour === activityHour;
          });
        } else {
          // Для архивного API ищем только по часу (дата уже задана)
          hourIndex = response.hourly.time.findIndex((time: string) => {
            const timeDate = new Date(time);
            return timeDate.getHours() === activityHour;
          });
        }

        if (hourIndex !== -1) {
          const windSpeed = response.hourly.windspeed_10m[hourIndex];
          const windDirection = response.hourly.winddirection_10m[hourIndex];

          if (windSpeed === null || windDirection === null) {
            return null;
          }

          const windInfo = {
            speed: windSpeed,
            direction: windDirection,
            date: dateKey,
          };

          // Кешируем данные
          setWindDataCache(prev => ({
            ...prev,
            [dateKey]: windInfo,
          }));

          return windInfo;
        }

        return null;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        return null;
      }
    } catch (error) {
      return null;
    }
  };

  // Функция расчета мощности с учетом ветра и кеширования
  const calculatePower = async (activity: any): Promise<PowerDataItem | null> => {
    if (!activity || !activity.distance || !activity.moving_time) {
      return null;
    }

    // Проверяем кеш
    const cacheKey = `${activity.id}_${riderWeight}_${bikeWeight}_${surfaceType}_${useWindData}`;
    const cached = powerCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
      // Кеш актуален (7 дней)
      return cached.data;
    }

    // Проверяем, есть ли реальные данные мощности
    const hasRealPower =
      activity.average_watts &&
      activity.max_watts &&
      (activity.type === 'VirtualRide' || activity.device_watts || activity.has_power_meter);

    // Если есть реальные данные, используем их
    if (hasRealPower) {
      const result: PowerDataItem = {
        id: activity.id.toString(),
        name: activity.name,
        date: activity.start_date,
        total: Math.round(activity.average_watts),
        hasRealPower: true,
        distance: activity.distance,
        time: activity.moving_time,
        temperature: activity.average_temp,
      };

      // Сохраняем в кеш
      setPowerCache(prev => ({
        ...prev,
        [cacheKey]: {data: result, timestamp: Date.now()},
      }));

      return result;
    }

    // Рассчитываем по формуле
    const totalWeight = riderWeight + bikeWeight;
    const distance = parseFloat(activity.distance) || 0;
    const time = parseFloat(activity.moving_time) || 0;
    const elevationGain = parseFloat(activity.total_elevation_gain) || 0;
    const avgSpeed = distance / time; // м/с

    if (distance <= 0 || time <= 0 || avgSpeed <= 0) {
      return null;
    }

    // Получаем температуру и высоту
    const temperature = activity.average_temp;
    const maxElevation = activity.elev_high;

    // Рассчитываем плотность воздуха
    const airDensity = calculateAirDensity(temperature, maxElevation);

    // Рассчитываем средний уклон с улучшенной логикой для спусков
    let averageGrade = elevationGain / distance;

    const speedKmh = avgSpeed * 3.6;
    const distanceKm = distance / 1000;

    // Определяем спуск на основе нескольких факторов
    if (elevationGain < 0) {
      // Явный спуск
      averageGrade = elevationGain / distance;
    } else if (speedKmh > 30 && elevationGain < distanceKm * 20) {
      // Высокая скорость с низким набором высоты - возможен спуск
      const estimatedDescentGrade = -(speedKmh - 25) / 30;
      averageGrade = Math.max(-0.10, estimatedDescentGrade);
    }

    // Дополнительная проверка для горных спусков
    const minElevation = activity.elev_low || 0;
    const elevationRange = maxElevation - minElevation;

    if (elevationRange > 200 && elevationGain < elevationRange * 0.3) {
      const descentGrade = -(elevationRange / distance);
      averageGrade = Math.max(-0.15, descentGrade);
    }

    // Компоненты мощности
    const rollingPower = CRR * totalWeight * GRAVITY * avgSpeed;

    // Получаем данные о ветре
    const windInfo = await getWindDataForActivity(activity);

    // Аэродинамическое сопротивление с учетом ветра
    let aeroPower = 0.5 * airDensity * CD_A * Math.pow(avgSpeed, 3);
    let windPower = 0;
    let effectiveSpeed: number | null = null;

    if (windInfo && windInfo.speed > 0) {
      // Рассчитываем эффективную скорость с учетом ветра
      const maxWindEffect = Math.min(windInfo.speed, 5); // макс 5 м/с
      const windEffectMultiplier = 0.3; // 30% влияния

      effectiveSpeed = (avgSpeed + maxWindEffect * windEffectMultiplier) * 3.6; // км/ч

      // Пересчитываем аэродинамическое сопротивление
      const aeroPowerWithWind = 0.5 * airDensity * CD_A * Math.pow(avgSpeed + maxWindEffect * windEffectMultiplier, 3);
      windPower = aeroPowerWithWind - aeroPower;
      aeroPower = aeroPowerWithWind;
    }

    // Гравитационная сила
    let gravityPower = totalWeight * GRAVITY * averageGrade * avgSpeed;

    // Для спусков ограничиваем гравитационную помощь
    if (averageGrade < 0) {
      const maxAssistance = (rollingPower + aeroPower) * 0.8;
      gravityPower = Math.max(-maxAssistance, gravityPower);
    }

    // Общая мощность
    let totalPower = rollingPower + aeroPower + gravityPower;

    // На спуске мощность не может быть меньше минимальной
    if (averageGrade < 0) {
      const minPowerOnDescent = Math.max(10, Math.abs(averageGrade) * 100);
      totalPower = Math.max(minPowerOnDescent, totalPower);
    }

    // Проверяем разумность мощности
    if (isNaN(totalPower) || totalPower < 0 || totalPower > 2000) {
      return null;
    }

    const result: PowerDataItem = {
      id: activity.id.toString(),
      name: activity.name,
      date: activity.start_date,
      total: Math.round(totalPower),
      hasRealPower: false,
      distance: activity.distance,
      time: activity.moving_time,
      gravity: Math.round(gravityPower),
      gravityType: averageGrade > 0 ? 'resistance' : 'assistance',
      rolling: Math.round(rollingPower),
      aero: Math.round(aeroPower),
      wind: Math.round(windPower),
      windSpeed: windInfo ? windInfo.speed : null,
      windDirection: windInfo ? windInfo.direction : null,
      effectiveSpeed: effectiveSpeed,
      airDensity: airDensity.toFixed(3),
      temperature: temperature,
      grade: ((averageGrade || 0) * 100).toFixed(1),
      speed: ((avgSpeed || 0) * 3.6).toFixed(1),
      elevation: Math.round(elevationGain),
    };

    // Сохраняем в кеш
    setPowerCache(prev => ({
      ...prev,
      [cacheKey]: {data: result, timestamp: Date.now()},
    }));

    return result;
  };

  // Анализируем последние 50 активностей
  useEffect(() => {
    const analyzePower = async () => {
      if (!activities || activities.length === 0) {
        setPowerData([]);
        return;
      }

      setLoading(true);
      try {
        // Берем последние 50 активностей
        const recentActivities = activities.slice(0, 50);
        const powerResults: PowerDataItem[] = [];

        for (const activity of recentActivities) {
          const result = await calculatePower(activity);
          if (result) {
            powerResults.push(result);
          }
        }

        setPowerData(powerResults);
      } catch (error) {
        console.error('Error analyzing power:', error);
      } finally {
        setLoading(false);
      }
    };

    analyzePower();
  }, [activities, riderWeight, bikeWeight]);

  // Рассчитываем статистику
  const stats: PowerStats | null = useMemo(() => {
    if (!powerData || powerData.length === 0) return null;

    const powers = powerData.map(d => d.total);
    const avgPower = Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);

    // Считаем активности с данными о ветре и power meter
    const activitiesWithWindData = powerData.filter(d => d.windSpeed !== null && d.windSpeed !== undefined).length;
    const activitiesWithRealPower = powerData.filter(d => d.hasRealPower).length;

    return {
      avgPower,
      maxPower,
      minPower,
      totalActivities: powerData.length,
      activitiesWithWindData,
      activitiesWithRealPower,
    };
  }, [powerData]);

  // Передаем статистику наверх через callback
  useEffect(() => {
    if (onStatsCalculated && stats) {
      onStatsCalculated(stats);
    }
  }, [stats, onStatsCalculated]);

  // Топ-5 активностей по мощности
  const topActivitiesByPower = useMemo(() => {
    return [...powerData].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [powerData]);

  // Данные для графика (сортируем по дате, последние 30 активностей)
  const chartData = useMemo(() => {
    if (!powerData || powerData.length === 0) return null;

    // Сортируем по дате и берем последние 30
    const sortedByDate = [...powerData]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30);

    const labels = sortedByDate.map(d => {
      const date = new Date(d.date);
      return `${date.getDate()}/${date.getMonth() + 1}`;
    });

    const data = sortedByDate.map(d => d.total);

    return {labels, data, activities: sortedByDate};
  }, [powerData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#274DD3" />
        <Text style={styles.loadingText}>Analyzing power data...</Text>
      </View>
    );
  }

  if (!stats) {
    return null;
  }

  // Render tooltip for pointer
  const renderTooltip = (items: any) => {
    if (!items || items.length === 0 || !chartData) return null;
    
    const item = items[0];
    const activity = chartData.activities[item.index];
    if (!activity) return null;
    
    // Trigger haptic only once per point
    if (hapticTriggeredRef.current !== item.index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current = item.index;
    }
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>{activity.name}</Text>
        <Text style={styles.tooltipDate}>
          {new Date(activity.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Power:</Text>
          <Text style={styles.tooltipValue}>{activity.total}W</Text>
        </View>
        {!activity.hasRealPower && activity.gravity !== undefined && (
          <>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>
                Gravity ({activity.gravityType}):
              </Text>
              <Text style={[
                styles.tooltipValue,
                {color: activity.gravityType === 'assistance' ? '#10b981' : '#ef4444'}
              ]}>
                {activity.gravity}W
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Rolling:</Text>
              <Text style={styles.tooltipValue}>{activity.rolling}W</Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Aero:</Text>
              <Text style={styles.tooltipValue}>{activity.aero}W</Text>
            </View>
            {activity.wind !== undefined && activity.wind !== 0 && (
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Wind:</Text>
                <Text style={[
                  styles.tooltipValue,
                  {color: activity.wind > 0 ? '#ef4444' : '#10b981'}
                ]}>
                  {activity.wind > 0 ? '+' : ''}{activity.wind}W
                </Text>
              </View>
            )}
          </>
        )}
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Speed:</Text>
          <Text style={styles.tooltipValue}>{activity.speed} km/h</Text>
        </View>
        {activity.windSpeed && (
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Wind:</Text>
            <Text style={styles.tooltipValue}>{activity.windSpeed.toFixed(1)} m/s</Text>
          </View>
        )}
        {activity.temperature && (
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Temp:</Text>
            <Text style={styles.tooltipValue}>{activity.temperature}°C</Text>
          </View>
        )}
        {activity.hasRealPower && (
          <View style={styles.tooltipBadge}>
            <Text style={styles.tooltipBadgeText}>✓ Power Meter Data</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>POWER</Text>
      <Text style={styles.subtitle}>Last 50 activities</Text>

      {/* Stats Cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsScrollContent}
        style={styles.statsScroll}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.avgPower}</Text>
          <Text style={styles.statLabel}>Average Power (W)</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.maxPower}</Text>
          <Text style={styles.statLabel}>Maximum Power (W)</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.minPower}</Text>
          <Text style={styles.statLabel}>Minimum Power (W)</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalActivities}</Text>
          <Text style={styles.statLabel}>Total Activities</Text>
        </View>
        {stats.activitiesWithWindData && stats.activitiesWithWindData > 0 && (
          <View style={[styles.statCard, {backgroundColor: '#1a4d2e'}]}>
            <Text style={styles.statValue}>{stats.activitiesWithWindData}</Text>
            <Text style={styles.statLabel}>With Wind Data 🌬️</Text>
          </View>
        )}
        {stats.activitiesWithRealPower && stats.activitiesWithRealPower > 0 && (
          <View style={[styles.statCard, {backgroundColor: '#0d5c3a'}]}>
            <Text style={styles.statValue}>{stats.activitiesWithRealPower}</Text>
            <Text style={styles.statLabel}>Power Meter ✓</Text>
          </View>
        )}
      </ScrollView>

      {/* Info Note */}
      <View style={styles.noteContainer}>
        <Text style={styles.noteText}>
          💡 Estimated power values based on physics calculations. 
          {useWindData && stats.activitiesWithWindData && stats.activitiesWithWindData > 0 && (
            ` Wind data included for ${stats.activitiesWithWindData} activities.`
          )}
          {' '}Using weights: {riderWeight}kg (rider) + {bikeWeight}kg (bike).
        </Text>
      </View>

      {/* Power Chart */}
      {chartData && chartData.data.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>POWER DYNAMICS</Text>
          <View style={styles.chartContainer}> 
            <LineChart
              data={chartData.data.map((value: number, index: number) => ({
                value: value,
                index: index,
              }))}
              width={screenWidth - 2}
              height={240}
              maxValue={Math.max(...chartData.data) * 1.1}
              noOfSections={4}
              curved
              areaChart
              startFillColor="#7eaaff"
              startOpacity={0.2}
              endOpacity={0}
              spacing={Math.floor((screenWidth - 65) / Math.max(chartData.data.length - 1, 1))}
              color="#7eaaff"
              thickness={3}
              hideDataPoints={false}
              dataPointsColor="#7eaaff"
              dataPointsRadius={1}
              textColor1="#888"
              textFontSize={11}
              xAxisColor="#333"
              yAxisColor="transparent"
              xAxisThickness={1}
              yAxisThickness={0}
              rulesColor="#333"
              rulesThickness={1}
              yAxisTextStyle={{color: '#888', fontSize: 11}}
              xAxisLabelTextStyle={{color: '#888', fontSize: 11}}
              hideRules={false}
              showVerticalLines={false}
              verticalLinesColor="transparent"
              initialSpacing={10}
              endSpacing={10}
              pointerConfig={{
                pointerStripHeight: 200,
                pointerStripColor: '#7eaaff',
                pointerStripWidth: 2,
                pointerColor: '#7eaaff',
                radius: 6,
                pointerLabelWidth: 180,
                pointerLabelHeight: 220,
                activatePointersOnLongPress: false,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: renderTooltip,
              }}
            />
          </View>
        </View>
      )}

      {/* Top Activities */}
      {topActivitiesByPower.length > 0 && (
        <View style={styles.topActivitiesSection}>
          <Text style={styles.sectionTitle}>TOP 5 ACTIVITIES BY POWER</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topActivitiesScrollContent}
            style={styles.topActivitiesScroll}>
            {topActivitiesByPower.map((activity, index) => (
              <View key={activity.id} style={styles.activityCard}>
                <View style={styles.activityCardHeader}>
                 
                  <Text style={styles.powerValue}>{activity.total}W</Text>
                  <View style={styles.activityRank}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.activityName} numberOfLines={2}>
                  {activity.name}
                </Text>
                <Text style={styles.activityDate}>
                  {new Date(activity.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                {activity.hasRealPower && (
                  <View style={styles.realPowerBadge}>
                    <Text style={styles.realPowerText}>✓ Meter</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 32,
    marginHorizontal: 16,
  },
  loadingContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 40,
    marginTop: 20,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  title: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#d6d6d6',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  statsScroll: {
    marginBottom: 16,
  },
  statsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
    marginTop: 12,
  },
  statCard: {
    width: 140,
    backgroundColor: '#222',
    padding: 12,
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: 0,
    overflow: 'visible',
    zIndex: 1,
  },
  chartContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  topActivitiesSection: {
    marginBottom: 20,
  },
  topActivitiesScroll: {
    marginTop: 12,
  },
  topActivitiesScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 0,
    letterSpacing: 0.5,
    marginTop: 16,
  },
  activityCard: {
    width: 200,
    backgroundColor: '#222',
    padding: 12,
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  activityRank: {
    width: 24,
    height: 24,
    borderRadius: 16,
    backgroundColor: '#274DD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  activityName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
   
  },
  activityDate: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
  },
  powerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  realPowerBadge: {
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  realPowerText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '600',
  },
  noteContainer: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 11,
    color: '#888',
    lineHeight: 16,
  },
  chartTooltip: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    minWidth: 150,
    borderLeftWidth: 3,
    borderLeftColor: '#7eaaff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 999,
    zIndex: 9999,
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  tooltipDate: {
    fontSize: 11,
    color: '#888',
    marginBottom: 12,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tooltipLabel: {
    fontSize: 12,
    color: '#888',
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  tooltipBadge: {
    backgroundColor: '#10b981',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  tooltipBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
});

