import React, {useMemo} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {LineChart} from 'react-native-gifted-charts';
import {useChartOverlay} from '../hooks/useChartOverlay';

const screenWidth = Dimensions.get('window').width;

interface CadenceAnalysisProps {
  activities: any[];
  onHelpPress?: (topicId: string) => void;
}

export const CadenceAnalysis: React.FC<CadenceAnalysisProps> = ({
  activities,
  onHelpPress,
}) => {
  const {t} = useTranslation();
  const cadenceSpeedChart = useChartOverlay();
  const cadenceTrendChart = useChartOverlay();

  // Фильтруем только велосипедные активности
  const rides = useMemo(() => {
    return activities.filter(activity =>
      ['Ride', 'VirtualRide'].includes(activity.type),
    );
  }, [activities]);

  // 1. Статистика каденса
  const cadenceStats = useMemo(() => {
    const cadenceData = rides
      .filter(a => a.average_cadence)
      .map(a => a.average_cadence);

    if (cadenceData.length === 0) return null;

    return {
      avg: Math.round(cadenceData.reduce((sum, cad) => sum + cad, 0) / cadenceData.length),
      min: Math.min(...cadenceData),
      max: Math.max(...cadenceData),
      total: cadenceData.length,
    };
  }, [rides]);

  // 2. Cadence vs Speed - последние 20 тренировок
  const cadenceVsSpeedData = useMemo(() => {
    const sorted = rides
      .slice()
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    const last20 = sorted.slice(0, 20).reverse();

    const cadenceData = last20
      .filter(a => a.average_cadence && a.average_speed)
      .map(a => a.average_cadence);

    const speedData = last20
      .filter(a => a.average_cadence && a.average_speed)
      .map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));

    const labels = last20
      .filter(a => a.average_cadence && a.average_speed)
      .map(a => {
        const date = new Date(a.start_date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

    // Масштабируем скорость для визуализации
    const scaleFactor = 3;
    const scaledSpeedData = speedData.map(s => s * scaleFactor);

    return {
      labels: labels.length > 0 ? labels : [''],
      datasets: [
        {
          data: cadenceData.length > 0 ? cadenceData : [0],
          color: () => `rgba(139, 92, 246, 1)`,
          strokeWidth: 3,
        },
        {
          data: scaledSpeedData.length > 0 ? scaledSpeedData : [0],
          color: () => `rgba(0, 178, 255, 1)`,
          strokeWidth: 2,
        },
      ]
    };
  }, [rides]);

  // 3. Average Cadence Trend (Weekly)
  const avgCadenceTrendData = useMemo(() => {
    const weekMap: {[key: string]: {sum: number; count: number}} = {};

    rides.forEach(a => {
      if (!a.start_date || !a.average_cadence) return;
      const d = new Date(a.start_date);
      const week = getISOWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${week}`;

      if (!weekMap[key]) weekMap[key] = {sum: 0, count: 0};
      weekMap[key].sum += a.average_cadence;
      weekMap[key].count += 1;
    });

    const sorted = Object.entries(weekMap)
      .map(([key, val]) => ({
        week: key,
        avgCadence: Math.round(val.sum / val.count),
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      labels: sorted.length > 0 ? sorted.map(d => d.week.split('-W')[1]) : [''],
      datasets: [
        {
          data: sorted.length > 0 ? sorted.map(d => d.avgCadence) : [0],
          color: () => `rgba(139, 92, 246, 1)`,
          strokeWidth: 3,
        },
      ],
    };
  }, [rides]);

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

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#1a1a1a',
    backgroundGradientTo: '#1a1a1a',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    decimalPlaces: 0,
    color: () => `rgba(139, 92, 246, 1)`,
    labelColor: () => `rgba(176, 184, 201, 1)`,
    fillShadowGradient: 'rgba(139, 92, 246, 1)',
    fillShadowGradientOpacity: 0.3,
    style: {
      borderRadius: 12,
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: '#353a44',
      strokeWidth: 1,
    },
    propsForLabels: {
      fontSize: 11,
    },
  };

  if (!rides || rides.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{t('cadenceAnalysis.title')}</Text>
        <Text style={styles.noDataText}>{t('cadenceAnalysis.noData')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('cadenceAnalysis.title')}</Text>

      {/* Статистика каденса */}
      {cadenceStats && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
          style={styles.statsScroll}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.avg}</Text>
            <Text style={styles.statLabel}>{t('cadenceAnalysis.avgCadence')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.min}</Text>
            <Text style={styles.statLabel}>{t('cadenceAnalysis.minCadence')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.max}</Text>
            <Text style={styles.statLabel}>{t('cadenceAnalysis.maxCadence')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.total}</Text>
            <Text style={styles.statLabel}>{t('cadenceAnalysis.totalWorkouts')}</Text>
          </View>
        </ScrollView>
      )}

      <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
        {/* 1. Cadence vs Speed */}
        {cadenceVsSpeedData.labels.length > 1 && (
          <View
            style={styles.chartBlock}
            onTouchStart={cadenceSpeedChart.onTouchStart}
            onTouchEnd={cadenceSpeedChart.clear}
            onTouchCancel={cadenceSpeedChart.clear}>
            <View style={styles.titleRow}>
              <Text style={styles.chartTitle}>{t('cadenceAnalysis.vsSpeed')}</Text>
              {onHelpPress && (
                <TouchableOpacity style={styles.helpButton} onPress={() => onHelpPress('cadence_vs_speed')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Text style={styles.helpIcon}>?</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.chartWrapper}>
              {cadenceSpeedChart.isInteracting && cadenceSpeedChart.activeIndex !== null && (
                <View style={[styles.detailOverlay, {backgroundColor: '#8B5CF6'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>
                    {t('cadenceAnalysis.activity')}{cadenceSpeedChart.activeIndex + 1} • {cadenceVsSpeedData.labels[cadenceSpeedChart.activeIndex]}
                  </Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{cadenceVsSpeedData.datasets[0].data[cadenceSpeedChart.activeIndex]}</Text>
                    <Text style={styles.detailPillLabel}>{t('common.rpm')}</Text>
                    <View style={styles.detailDivider} />
                    <Text style={styles.detailPillValue}>{(cadenceVsSpeedData.datasets[1].data[cadenceSpeedChart.activeIndex] / 3).toFixed(1)}</Text>
                    <Text style={styles.detailPillLabel}>{t('common.kmh')}</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <LineChart
                  data={cadenceVsSpeedData.datasets[0].data.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  data2={cadenceVsSpeedData.datasets[1].data.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  width={screenWidth - 2}
                  height={220}
                  maxValue={Math.max(...cadenceVsSpeedData.datasets[0].data, ...cadenceVsSpeedData.datasets[1].data) * 1.1}
                  noOfSections={4}
                  curved
                  areaChart
                  startFillColor="#8B5CF6"
                  startOpacity={0.2}
                  endOpacity={0}
                  areaChart2
                  startFillColor2="#00B2FF"
                  startOpacity2={0}
                  endOpacity2={0}
                  spacing={Math.floor((screenWidth - 65) / Math.max(cadenceVsSpeedData.datasets[0].data.length - 1, 1))}
                  color="#8B5CF6"
                  color2="#00B2FF"
                  thickness={3}
                  thickness2={3}
                  hideDataPoints={false}
                  hideDataPoints2={false}
                  dataPointsColor="#8B5CF6"
                  dataPointsColor2="#00B2FF"
                  dataPointsRadius={1}
                  dataPointsRadius2={1}
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
                  pointerConfig={cadenceSpeedChart.getPointerConfig('#8B5CF6', 180)}
                />
              </View>
            </View>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#8B5CF6'}]} />
                <Text style={styles.legendText}>{t('cadenceAnalysis.avgCadenceLabel')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#00B2FF'}]} />
                <Text style={styles.legendText}>{t('cadenceAnalysis.avgSpeedLabel')}</Text>
              </View>
            </View>
            <Text style={styles.chartDescription}>
              {t('cadenceAnalysis.speedScaled')}
            </Text>
          </View>
        )}

        {/* 2. Average Cadence Trend */}
        {avgCadenceTrendData.labels.length > 1 && (
          <View
            style={styles.chartBlock}
            onTouchStart={cadenceTrendChart.onTouchStart}
            onTouchEnd={cadenceTrendChart.clear}
            onTouchCancel={cadenceTrendChart.clear}>
            <View style={styles.titleRow}>
              <Text style={styles.chartTitle}>{t('cadenceAnalysis.weeklyTrend')}</Text>
              {onHelpPress && (
                <TouchableOpacity style={styles.helpButton} onPress={() => onHelpPress('cadence_avg_trend')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Text style={styles.helpIcon}>?</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.chartWrapper}>
              {cadenceTrendChart.isInteracting && cadenceTrendChart.activeIndex !== null && (
                <View style={[styles.detailOverlay, {backgroundColor: '#8B5CF6'}]}>
                  <Text style={styles.detailTitle} numberOfLines={1}>{t('cadenceAnalysis.week')}{avgCadenceTrendData.labels[cadenceTrendChart.activeIndex]}</Text>
                  <View style={styles.detailValues}>
                    <Text style={styles.detailPillValue}>{avgCadenceTrendData.datasets[0].data[cadenceTrendChart.activeIndex]}</Text>
                    <Text style={styles.detailPillLabel}>{t('cadenceAnalysis.avgRpm')}</Text>
                  </View>
                </View>
              )}
              <View style={styles.chartContainer}>
                <LineChart
                  data={avgCadenceTrendData.datasets[0].data.map((value: number, index: number) => ({
                    value: value,
                    index: index,
                  }))}
                  width={screenWidth - 2}
                  height={220}
                  maxValue={Math.max(...avgCadenceTrendData.datasets[0].data) * 1.1}
                  noOfSections={4}
                  curved
                  areaChart
                  startFillColor="#8B5CF6"
                  startOpacity={0.2}
                  endOpacity={0}
                  spacing={Math.floor((screenWidth - 65) / Math.max(avgCadenceTrendData.datasets[0].data.length - 1, 1))}
                  color="#8B5CF6"
                  thickness={3}
                  hideDataPoints={false}
                  dataPointsColor="#8B5CF6"
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
                  pointerConfig={cadenceTrendChart.getPointerConfig('#8B5CF6', 180)}
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 20,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginTop: 20,
    marginHorizontal: 16,
    marginBottom: 72,
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
    marginBottom: 0,
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
  chartContainer: {
    marginTop: 4,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  chartWrapper: {
    position: 'relative',
    marginTop: 12,
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
    shadowOpacity: 0.4,
    shadowRadius: 12,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
  chart: {
    borderRadius: 12,
    marginVertical: 8,
   
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

