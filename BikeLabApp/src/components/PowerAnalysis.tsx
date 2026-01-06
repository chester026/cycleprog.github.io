import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {LineChart} from 'react-native-chart-kit';
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
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>POWER ANALYSIS</Text>
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
          <Text style={styles.sectionTitle}>Power Dynamics (Last 30 Activities)</Text>
          <View style={styles.noteContainer}>
            <Text style={styles.noteText}>
              📊 Estimated values based on speed, elevation, and weight.{' '}
              {powerData.filter(d => d.hasRealPower).length > 0
                ? `${powerData.filter(d => d.hasRealPower).length} activities with power meter data.`
                : 'Use power meter for accurate measurements.'}
            </Text>
          </View>
          <LineChart
            data={{
              labels: chartData.labels,
              datasets: [
                {
                  data: chartData.data,
                },
              ],
            }}
            width={screenWidth - 56} // padding
            height={240}
            chartConfig={{
              backgroundColor: '#1a1a1a',
              backgroundGradientFrom: '#1a1a1a',
              backgroundGradientTo: '#1a1a1a',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(126, 170, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(136, 136, 136, ${opacity})`,
              style: {
                borderRadius: 8,
              },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: '#7eaaff',
              },
              propsForBackgroundLines: {
                strokeDasharray: '5 5',
                stroke: '#333',
                strokeWidth: 1,
              },
            }}
            bezier
            style={styles.chart}
            withInnerLines={true}
            withOuterLines={false}
            withVerticalLabels={false}
            withHorizontalLabels={true}
            withVerticalLines={false}
            withHorizontalLines={true}
            withDots={true}
            withShadow={false}
            fromZero={false}
            onDataPointClick={({index}) => {
              setSelectedPoint(index === selectedPoint ? null : index);
            }}
          />
          
          {/* Tooltip */}
          {selectedPoint !== null && chartData.activities[selectedPoint] && (
            <TouchableOpacity
              style={styles.tooltip}
              onPress={() => setSelectedPoint(null)}
              activeOpacity={0.9}>
              <Text style={styles.tooltipTitle}>
                {chartData.activities[selectedPoint].name}
              </Text>
              <Text style={styles.tooltipDate}>
                {new Date(chartData.activities[selectedPoint].date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Power:</Text>
                <Text style={styles.tooltipValue}>
                  {chartData.activities[selectedPoint].total}W
                </Text>
              </View>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Distance:</Text>
                <Text style={styles.tooltipValue}>
                  {(chartData.activities[selectedPoint].distance / 1000).toFixed(2)} km
                </Text>
              </View>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Time:</Text>
                <Text style={styles.tooltipValue}>
                  {Math.floor(chartData.activities[selectedPoint].time / 3600)}:
                  {Math.floor((chartData.activities[selectedPoint].time % 3600) / 60)
                    .toString()
                    .padStart(2, '0')}{' '}
                  h
                </Text>
              </View>
              {chartData.activities[selectedPoint].hasRealPower && (
                <View style={styles.tooltipBadge}>
                  <Text style={styles.tooltipBadgeText}>✓ Power Meter Data</Text>
                </View>
              )}
              <Text style={styles.tooltipHint}>Tap to close</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Top Activities */}
      {topActivitiesByPower.length > 0 && (
        <View style={styles.topActivitiesSection}>
          <Text style={styles.sectionTitle}>Top 5 Activities by Power</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topActivitiesScrollContent}
            style={styles.topActivitiesScroll}>
            {topActivitiesByPower.map((activity, index) => (
              <View key={activity.id} style={styles.activityCard}>
                <View style={styles.activityCardHeader}>
                  <View style={styles.activityRank}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.powerValue}>{activity.total}W</Text>
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
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  statsScroll: {
    marginBottom: 20,
  },
  statsScrollContent: {
    paddingHorizontal: 0,
    gap: 12,
  },
  statCard: {
    width: 140,
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: 24,
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
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 0,
    letterSpacing: 0.5,
  },
  activityCard: {
    width: 200,
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 16,
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#274DD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  activityName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
    minHeight: 36,
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
    fontSize: 10,
    color: '#888',
    lineHeight: 14,
  },
  tooltip: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#7eaaff',
  },
  tooltipTitle: {
    fontSize: 14,
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
  tooltipHint: {
    fontSize: 10,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

