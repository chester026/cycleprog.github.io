import React, {useMemo, useRef, useState, useCallback} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView} from 'react-native';
import {LineChart, BarChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {useChartOverlay} from '../hooks/useChartOverlay';

const screenWidth = Dimensions.get('window').width;

interface SpeedAnalysisProps {
  activities: any[];
}

export const SpeedAnalysis: React.FC<SpeedAnalysisProps> = ({
  activities,
}) => {
  const hapticTriggeredRef = useRef<{[key: string]: number | null}>({
    avgSpeedTrend: null,
    maxSpeedTrend: null,
    speedFlatTrend: null,
    speedHillsTrend: null,
  });

  // Фильтруем только велосипедные активности
  const rides = useMemo(() => {
    return activities.filter(activity =>
      ['Ride', 'VirtualRide'].includes(activity.type),
    );
  }, [activities]);

  // 1. Статистика скорости
  const speedStats = useMemo(() => {
    const speedData = rides
      .filter(a => a.average_speed)
      .map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));

    if (speedData.length === 0) return null;

    const maxSpeedData = rides
      .filter(a => a.max_speed)
      .map(a => parseFloat((a.max_speed * 3.6).toFixed(1)));

    return {
      avg: (speedData.reduce((sum, spd) => sum + spd, 0) / speedData.length).toFixed(1),
      min: Math.min(...speedData).toFixed(1),
      max: Math.max(...maxSpeedData).toFixed(1),
      total: speedData.length,
    };
  }, [rides]);

  // 2. Average Speed Trend (Weekly)
  const avgSpeedTrendData = useMemo(() => {
    const weekMap: {[key: string]: {sum: number; count: number; max: number}} = {};

    rides.forEach(a => {
      if (!a.start_date || !a.average_speed) return;
      const d = new Date(a.start_date);
      const week = getISOWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${week.toString().padStart(2, '0')}`;

      if (!weekMap[key]) weekMap[key] = {sum: 0, count: 0, max: 0};
      weekMap[key].sum += a.average_speed * 3.6;
      weekMap[key].count += 1;
      
      if (a.max_speed) {
        const maxSpeed = a.max_speed * 3.6;
        if (maxSpeed > weekMap[key].max) {
          weekMap[key].max = maxSpeed;
        }
      }
    });

    const sorted = Object.entries(weekMap)
      .map(([key, val]) => ({
        week: key,
        avgSpeed: (val.sum / val.count).toFixed(1),
        maxSpeed: val.max.toFixed(1),
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-26); // Last 26 weeks (half year)

    return {
      labels: sorted.length > 0 ? sorted.map(d => d.week.split('-W')[1]) : [''],
      avgData: sorted.length > 0 ? sorted.map(d => parseFloat(d.avgSpeed)) : [0],
      maxData: sorted.length > 0 ? sorted.map(d => parseFloat(d.maxSpeed)) : [0],
    };
  }, [rides]);

  // 3. Speed on Flat vs Hills
  const speedTerrainData = useMemo(() => {
    const weekMap: {[key: string]: {
      flatSum: number; 
      flatCount: number;
      hillsSum: number;
      hillsCount: number;
    }} = {};

    rides.forEach(a => {
      if (!a.start_date || !a.average_speed || !a.distance || !a.total_elevation_gain) return;
      
      const d = new Date(a.start_date);
      const week = getISOWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${week}`;

      if (!weekMap[key]) {
        weekMap[key] = {flatSum: 0, flatCount: 0, hillsSum: 0, hillsCount: 0};
      }

      // Определяем тип местности по набору высоты на км
      const elevPerKm = (a.total_elevation_gain / (a.distance / 1000));
      const speed = a.average_speed * 3.6;

      if (elevPerKm < 10) {
        // Равнина (менее 10м на км)
        weekMap[key].flatSum += speed;
        weekMap[key].flatCount += 1;
      } else {
        // Холмистая местность (более 10м на км)
        weekMap[key].hillsSum += speed;
        weekMap[key].hillsCount += 1;
      }
    });

    // Separate data for flat and hills
    const flatSorted = Object.entries(weekMap)
      .filter(([, val]) => val.flatCount > 0)
      .map(([key, val]) => ({
        week: key,
        speed: (val.flatSum / val.flatCount).toFixed(1),
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-16);

    const hillsSorted = Object.entries(weekMap)
      .filter(([, val]) => val.hillsCount > 0) // Only weeks with hills data
      .map(([key, val]) => ({
        week: key,
        speed: (val.hillsSum / val.hillsCount).toFixed(1),
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-16);

    return {
      flatLabels: flatSorted.length > 0 ? flatSorted.map(d => d.week.split('-W')[1]) : [''],
      flatData: flatSorted.length > 0 ? flatSorted.map(d => parseFloat(d.speed)) : [0],
      hillsLabels: hillsSorted.length > 0 ? hillsSorted.map(d => d.week.split('-W')[1]) : [''],
      hillsData: hillsSorted.length > 0 ? hillsSorted.map(d => parseFloat(d.speed)) : [0],
    };
  }, [rides]);

  const avgSpeedChart = useChartOverlay();
  const flatSpeedChart = useChartOverlay();
  const hillsSpeedChart = useChartOverlay();
  const [activeBar, setActiveBar] = useState<{label: string; value: number} | null>(null);
  const barTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBarPress = useCallback((label: string, value: number) => {
    ReactNativeHapticFeedback.trigger('impactLight', {enableVibrateFallback: true});
    setActiveBar({label, value});
    if (barTimeoutRef.current) clearTimeout(barTimeoutRef.current);
    barTimeoutRef.current = setTimeout(() => setActiveBar(null), 3000);
  }, []);

  // Helper: ISO week number
  function getISOWeekNumber(date: Date) {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  if (!rides || rides.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>SPEED</Text>
        <Text style={styles.noDataText}>Not enough data for speed analysis</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>SPEED</Text>

      {/* Статистика скорости */}
      {speedStats && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
          style={styles.statsScroll}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{speedStats.avg}</Text>
            <Text style={styles.statLabel}>Avg Speed (km/h)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{speedStats.min}</Text>
            <Text style={styles.statLabel}>Min Speed (km/h)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{speedStats.max}</Text>
            <Text style={styles.statLabel}>Max Speed (km/h)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{speedStats.total}</Text>
            <Text style={styles.statLabel}>Total Workouts</Text>
          </View>
        </ScrollView>
      )}

      <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
        {/* 1. Average Speed Trend */}
        {avgSpeedTrendData.labels.length > 1 && (
          <View
            style={styles.chartBlock}
            onTouchStart={avgSpeedChart.onTouchStart}
            onTouchEnd={avgSpeedChart.clear}
            onTouchCancel={avgSpeedChart.clear}>
            <Text style={styles.chartTitle}>Average Speed Trend (Weekly)</Text>
            <View style={styles.chartWrapper}>
              {avgSpeedChart.isInteracting && avgSpeedChart.activeIndex !== null && (
                <View style={[styles.detailOverlay, {backgroundColor: '#4CAF50'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>Week {avgSpeedTrendData.labels[avgSpeedChart.activeIndex]}</Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{avgSpeedTrendData.avgData[avgSpeedChart.activeIndex]}</Text>
                    <Text style={styles.detailPillLabel}>avg km/h</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <LineChart
                  data={avgSpeedTrendData.avgData.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  width={screenWidth - 2}
                  height={220}
                  maxValue={Math.max(...avgSpeedTrendData.avgData) * 1.1}
                  noOfSections={4}
                  curved
                  areaChart
                  startFillColor="#4CAF50"
                  startOpacity={0.2}
                  endOpacity={0}
                  spacing={Math.floor((screenWidth - 65) / Math.max(avgSpeedTrendData.avgData.length - 1, 1))}
                  color="#4CAF50"
                  thickness={3}
                  hideDataPoints={false}
                  dataPointsColor="#4CAF50"
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
                  pointerConfig={avgSpeedChart.getPointerConfig('#4CAF50', 180)}
                />
              </View>
            </View>
          </View>
        )}

        {/* 2. Max Speed Trend */}
        {avgSpeedTrendData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Max Speed Trend (Weekly)</Text>
            <View style={styles.chartWrapper}>
              {activeBar && (
                <View style={[styles.detailOverlay, {backgroundColor: '#388B3C'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>Week {activeBar.label}</Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{activeBar.value}</Text>
                    <Text style={styles.detailPillLabel}>max km/h</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <BarChart
                  data={avgSpeedTrendData.maxData.map((value: number, index: number) => ({
                    value: value,
                    label: avgSpeedTrendData.labels[index],
                    frontColor: '#388B3C',
                    onPress: () => handleBarPress(avgSpeedTrendData.labels[index], value),
                  }))}
                  width={screenWidth - 60}
                  height={220}
                  maxValue={Math.max(...avgSpeedTrendData.maxData) * 1.1}
                  noOfSections={6}
                  barWidth={Math.max(8, Math.floor((screenWidth - 100) / avgSpeedTrendData.maxData.length) - 12)}
                  barBorderRadius={0}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor="#333"
                  yAxisTextStyle={{color: '#888', fontSize: 11}}
                  xAxisLabelTextStyle={{color: '#888', fontSize: 9}}
                  rulesColor="#333"
                  rulesThickness={1}
                  hideRules={false}
                  isAnimated
                  animationDuration={300}
                  showScrollIndicator
                />
              </View>
            </View>
          </View>
        )}

        {/* 3. Speed on Flat */}
        {speedTerrainData.flatLabels.length > 1 && (
          <View
            style={styles.chartBlock}
            onTouchStart={flatSpeedChart.onTouchStart}
            onTouchEnd={flatSpeedChart.clear}
            onTouchCancel={flatSpeedChart.clear}>
            <Text style={styles.chartTitle}>Speed on Flat (Weekly)</Text>
            <View style={styles.chartWrapper}>
              {flatSpeedChart.isInteracting && flatSpeedChart.activeIndex !== null && (
                <View style={[styles.detailOverlay, {backgroundColor: '#4CAF50'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>Week {speedTerrainData.flatLabels[flatSpeedChart.activeIndex]}</Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{speedTerrainData.flatData[flatSpeedChart.activeIndex]}</Text>
                    <Text style={styles.detailPillLabel}>km/h</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <LineChart
                  data={speedTerrainData.flatData.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  width={screenWidth - 2}
                  height={220}
                  maxValue={Math.max(...speedTerrainData.flatData) * 1.1}
                  noOfSections={6}
                  curved
                  areaChart
                  startFillColor="#4CAF50"
                  startOpacity={0.2}
                  endOpacity={0}
                  spacing={Math.floor((screenWidth - 65) / Math.max(speedTerrainData.flatData.length - 1, 1))}
                  color="#4CAF50"
                  thickness={3}
                  hideDataPoints={false}
                  dataPointsColor="#4CAF50"
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
                  pointerConfig={flatSpeedChart.getPointerConfig('#4CAF50', 180)}
                />
              </View>
            </View>
            <Text style={styles.chartDescription}>
              Flat terrain: {'<'}10m elevation gain per km
            </Text>
          </View>
        )}

        {/* 4. Speed on Hills */}
        {speedTerrainData.hillsLabels.length > 1 && (
          <View
            style={styles.chartBlock}
            onTouchStart={hillsSpeedChart.onTouchStart}
            onTouchEnd={hillsSpeedChart.clear}
            onTouchCancel={hillsSpeedChart.clear}>
            <Text style={styles.chartTitle}>Speed on Hills (Weekly)</Text>
            <View style={styles.chartWrapper}>
              {hillsSpeedChart.isInteracting && hillsSpeedChart.activeIndex !== null && (
                  <View style={[styles.detailOverlay, {backgroundColor: '#FF9800'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>Week {speedTerrainData.hillsLabels[hillsSpeedChart.activeIndex]}</Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{speedTerrainData.hillsData[hillsSpeedChart.activeIndex]}</Text>
                    <Text style={styles.detailPillLabel}>km/h</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <LineChart
                  data={speedTerrainData.hillsData.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  width={screenWidth - 2}
                  height={220}
                  maxValue={Math.max(...speedTerrainData.hillsData) * 1.1}
                  noOfSections={6}
                  curved
                  areaChart
                  startFillColor="#FF9800"
                  startOpacity={0.2}
                  endOpacity={0}
                  spacing={Math.floor((screenWidth - 65) / Math.max(speedTerrainData.hillsData.length - 1, 1))}
                  color="#FF9800"
                  thickness={3}
                  hideDataPoints={false}
                  dataPointsColor="#FF9800"
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
                  pointerConfig={hillsSpeedChart.getPointerConfig('#FF9800', 180)}
                />
              </View>
            </View>
            <Text style={styles.chartDescription}>
              Hilly terrain: {'>'}10m elevation gain per km (showing only weeks with hills)
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#d6d6d6',
    marginBottom: 16,
  },
  noDataText: {
    color: '#b0b8c9',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  statsScroll: {

  },
  statsScrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  statCard: {
    width: 160,
    backgroundColor: '#222',
    padding: 12,
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#b0b8c9',
    textAlign: 'center',
  },
  chartBlock: {
    marginBottom: 24,
    overflow: 'visible',
    zIndex: 1,
  },
  chartWrapper: {
    position: 'relative',
    marginTop: 12,
  },
  chartContainer: {
    marginTop: 4,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  detailOverlay: {
    position: 'absolute',
    top: -65,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgb(43, 43, 43)',
    paddingHorizontal: 12,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 100,
    borderLeftWidth: 0,
    borderLeftColor: '#7eaaff',
  },
  detailTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginRight: 12,
  },
  detailValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  detailDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    marginHorizontal: 6,
    alignSelf: 'center',
  },
  detailPillValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  detailPillLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    marginTop: 32,
    textTransform: 'uppercase',
  },
  chartDescription: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#f6f8ff',
  },
});
