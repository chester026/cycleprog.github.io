import React, {useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView} from 'react-native';
import {LineChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const screenWidth = Dimensions.get('window').width;

interface CadenceAnalysisProps {
  activities: any[];
}

export const CadenceAnalysis: React.FC<CadenceAnalysisProps> = ({
  activities,
}) => {
  const hapticTriggeredRef = useRef<{[key: string]: number | null}>({
    cadenceSpeed: null,
    cadenceTrend: null,
  });

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
        <Text style={styles.sectionTitle}>CADENCE</Text>
        <Text style={styles.noDataText}>Not enough data for cadence analysis</Text>
      </View>
    );
  }

  // Tooltip renderers
  const renderCadenceSpeedTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const index = item.index;
    
    if (hapticTriggeredRef.current.cadenceSpeed !== index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current.cadenceSpeed = index;
    }
    
    const cadenceValue = cadenceVsSpeedData.datasets[0].data[index];
    const speedValue = (cadenceVsSpeedData.datasets[1].data[index] / 3).toFixed(1);
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>Activity {index + 1}</Text>
        <Text style={styles.tooltipDate}>{cadenceVsSpeedData.labels[index]}</Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg Cadence:</Text>
          <Text style={styles.tooltipValue}>{cadenceValue} rpm</Text>
        </View>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg Speed:</Text>
          <Text style={styles.tooltipValue}>{speedValue} km/h</Text>
        </View>
      </View>
    );
  };

  const renderCadenceTrendTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const index = item.index;
    
    if (hapticTriggeredRef.current.cadenceTrend !== index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current.cadenceTrend = index;
    }
    
    const cadenceValue = avgCadenceTrendData.datasets[0].data[index];
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>Week {avgCadenceTrendData.labels[index]}</Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg Cadence:</Text>
          <Text style={styles.tooltipValue}>{cadenceValue} rpm</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>CADENCE</Text>

      {/* Статистика каденса */}
      {cadenceStats && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
          style={styles.statsScroll}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.avg}</Text>
            <Text style={styles.statLabel}>Avg Cadence (rpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.min}</Text>
            <Text style={styles.statLabel}>Min Cadence (rpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.max}</Text>
            <Text style={styles.statLabel}>Max Cadence (rpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{cadenceStats.total}</Text>
            <Text style={styles.statLabel}>Total Workouts</Text>
          </View>
        </ScrollView>
      )}

      <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
        {/* 1. Cadence vs Speed */}
        {cadenceVsSpeedData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Avg Cadence vs Avg Speed</Text>
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
                pointerConfig={{
                  pointerStripHeight: 180,
                  pointerStripColor: '#8B5CF6',
                  pointerStripWidth: 2,
                  pointerColor: '#8B5CF6',
                  radius: 6,
                  pointerLabelWidth: 140,
                  pointerLabelHeight: 150,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: renderCadenceSpeedTooltip,
                }}
              />
            </View>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#8B5CF6'}]} />
                <Text style={styles.legendText}>Avg Cadence</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#00B2FF'}]} />
                <Text style={styles.legendText}>Avg Speed (km/h)</Text>
              </View>
            </View>
            <Text style={styles.chartDescription}>
              Speed is scaled ×3 for visualization
            </Text>
          </View>
        )}

        {/* 2. Average Cadence Trend */}
        {avgCadenceTrendData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Average Cadence Trend (Weekly)</Text>
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
                pointerConfig={{
                  pointerStripHeight: 180,
                  pointerStripColor: '#8B5CF6',
                  pointerStripWidth: 2,
                  pointerColor: '#8B5CF6',
                  radius: 6,
                  pointerLabelWidth: 120,
                  pointerLabelHeight: 120,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: renderCadenceTrendTooltip,
                }}
              />
            </View>
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
    marginBottom: 16,
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
    marginTop: 16,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  chartTooltip: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    minWidth: 160,
    borderLeftWidth: 3,
    borderLeftColor: '#8B5CF6',
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
  chartTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f6f8ff',
    marginBottom: 12,
    marginTop: 12,
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

