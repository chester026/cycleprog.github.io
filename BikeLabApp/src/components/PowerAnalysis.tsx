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
  temperature?: number | null;
}

export const PowerAnalysis: React.FC<PowerAnalysisProps> = ({activities, onStatsCalculated}) => {
  const [powerData, setPowerData] = useState<PowerDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const hapticTriggeredRef = useRef<number | null>(null);

  // Параметры по умолчанию
  const [riderWeight] = useState(75);
  const [bikeWeight] = useState(8);

  // Константы для расчетов
  const GRAVITY = 9.81;
  const AIR_DENSITY = 1.225;
  const CD_A = 0.4;
  const CRR = 0.005; // Асфальт

  // Загружаем профиль пользователя
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await apiFetch('/api/user-profile');
        setUserProfile(profile);
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

  // Упрощенная функция расчета мощности (без API погоды)
  const calculatePower = async (activity: any): Promise<PowerDataItem | null> => {
    if (!activity || !activity.distance || !activity.moving_time) {
      return null;
    }

    // Проверяем, есть ли реальные данные мощности
    const hasRealPower =
      activity.average_watts &&
      activity.max_watts &&
      (activity.type === 'VirtualRide' || activity.device_watts || activity.has_power_meter);

    // Если есть реальные данные, используем их
    if (hasRealPower) {
      return {
        id: activity.id.toString(),
        name: activity.name,
        date: activity.start_date,
        total: Math.round(activity.average_watts),
        hasRealPower: true,
        distance: activity.distance,
        time: activity.moving_time,
      };
    }

    // Иначе рассчитываем по формуле
    const totalWeight = riderWeight + bikeWeight;
    const avgSpeed = activity.distance / activity.moving_time; // м/с
    const elevationGain = activity.total_elevation_gain || 0;
    const avgGrade = elevationGain / activity.distance;

    // Используем среднюю температуру и высоту если есть
    const airDensity = calculateAirDensity(activity.average_temp, activity.elev_high);

    // Компоненты мощности
    const gravityPower = totalWeight * GRAVITY * avgSpeed * avgGrade; // Подъем
    const rollingPower = CRR * totalWeight * GRAVITY * avgSpeed; // Качение
    const aeroPower = 0.5 * CD_A * airDensity * Math.pow(avgSpeed, 3); // Аэродинамика

    const totalPower = gravityPower + rollingPower + aeroPower;

    return {
      id: activity.id.toString(),
      name: activity.name,
      date: activity.start_date,
      total: Math.round(Math.max(0, totalPower)), // Не может быть отрицательной
      hasRealPower: false,
      distance: activity.distance,
      time: activity.moving_time,
      temperature: activity.average_temp,
    };
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

    return {
      avgPower,
      maxPower,
      minPower,
      totalActivities: powerData.length,
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
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Distance:</Text>
          <Text style={styles.tooltipValue}>
            {(activity.distance / 1000).toFixed(2)} km
          </Text>
        </View>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Time:</Text>
          <Text style={styles.tooltipValue}>
            {Math.floor(activity.time / 3600)}:
            {Math.floor((activity.time % 3600) / 60).toString().padStart(2, '0')} h
          </Text>
        </View>
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
      </ScrollView>

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

