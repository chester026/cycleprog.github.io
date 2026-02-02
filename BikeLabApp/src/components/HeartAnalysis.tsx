import React, {useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Dimensions, ScrollView} from 'react-native';
import {LineChart, BarChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Svg, {Circle, G} from 'react-native-svg';

const screenWidth = Dimensions.get('window').width;

interface HeartAnalysisProps {
  activities: any[];
  userProfile: any;
}

export const HeartAnalysis: React.FC<HeartAnalysisProps> = ({
  activities,
  userProfile,
}) => {
  const hapticTriggeredRef = useRef<{[key: string]: number | null}>({
    hrSpeed: null,
    hrTrend: null,
    maxHR: null,
  });

  // Фильтруем только велосипедные активности
  const rides = useMemo(() => {
    return activities.filter(activity =>
      ['Ride', 'VirtualRide'].includes(activity.type),
    );
  }, [activities]);

  // 1. Статистика пульса
  const heartRateStats = useMemo(() => {
    const hrData = rides
      .filter(a => a.average_heartrate)
      .map(a => a.average_heartrate);

    if (hrData.length === 0) return null;

    return {
      avg: Math.round(hrData.reduce((sum, hr) => sum + hr, 0) / hrData.length),
      min: Math.min(...hrData),
      max: Math.max(...hrData),
      total: hrData.length,
    };
  }, [rides]);

  // 2. HR vs Speed - последние 20 тренировок
  const hrVsSpeedData = useMemo(() => {
    const sorted = rides
      .slice()
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    const last20 = sorted.slice(0, 20).reverse();

    const hrData = last20
      .filter(a => a.average_heartrate && a.average_speed)
      .map(a => a.average_heartrate);

    const speedData = last20
      .filter(a => a.average_heartrate && a.average_speed)
      .map(a => parseFloat((a.average_speed * 3.6).toFixed(1)));

    const labels = last20
      .filter(a => a.average_heartrate && a.average_speed)
      .map(a => {
        const date = new Date(a.start_date);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });

    // Масштабируем скорость, чтобы она была в том же диапазоне, что и HR
    // Обычно HR: 120-160, Speed: 20-30 км/ч
    // Коэффициент масштабирования: ~5
    const scaleFactor = 5;
    const scaledSpeedData = speedData.map(s => s * scaleFactor);

    return {
      labels: labels.length > 0 ? labels : [''],
      datasets: [
        {
          data: hrData.length > 0 ? hrData : [0],
          color: () => `rgba(255, 94, 0, 1)`,
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

  // 3. Average HR Trend (Weekly)
  const avgHRTrendData = useMemo(() => {
    // Группируем по неделям
    const weekMap: {[key: string]: {sum: number; count: number}} = {};

    rides.forEach(a => {
      if (!a.start_date || !a.average_heartrate) return;
      const d = new Date(a.start_date);
      const week = getISOWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${week}`;

      if (!weekMap[key]) weekMap[key] = {sum: 0, count: 0};
      weekMap[key].sum += a.average_heartrate;
      weekMap[key].count += 1;
    });

    const sorted = Object.entries(weekMap)
      .map(([key, val]) => ({
        week: key,
        avgHR: Math.round(val.sum / val.count),
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      labels: sorted.length > 0 ? sorted.map(d => d.week.split('-W')[1]) : [''],
      datasets: [
        {
          data: sorted.length > 0 ? sorted.map(d => d.avgHR) : [0],
          color: () => `rgba(255, 94, 0, 1)`,
          strokeWidth: 3,
        },
      ],
    };
  }, [rides]);

  // 4. Max HR per Week - последние 26 недель
  const maxHRPerWeekData = useMemo(() => {
    const weekMap: {[key: string]: number} = {};

    // Собираем данные по неделям
    rides.forEach(a => {
      if (!a.start_date || !a.max_heartrate) return;
      const d = new Date(a.start_date);
      const week = getISOWeekNumber(d);
      const year = d.getFullYear();
      const key = `${year}-W${week}`;

      if (!weekMap[key] || a.max_heartrate > weekMap[key]) {
        weekMap[key] = a.max_heartrate;
      }
    });

    // Создаем массив последних 26 недель от текущей даты
    const now = new Date();
    const result = [];
    
    for (let i = 25; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - (i * 7));
      const week = getISOWeekNumber(targetDate);
      const year = targetDate.getFullYear();
      const key = `${year}-W${week}`;
      
      result.push({
        week: key,
        maxHR: weekMap[key] || 0,
      });
    }

    // Фильтруем только недели с данными
    const filtered = result.filter(d => d.maxHR > 0);

    return {
      labels: filtered.length > 0 ? filtered.map(d => d.week.split('-W')[1]) : [''],
      datasets: [
        {
          data: filtered.length > 0 ? filtered.map(d => d.maxHR) : [0],
        },
      ],
    };
  }, [rides]);

  // 5. HR Zones Distribution (Donut Chart) - LAST 6 MONTHS
  const hrZonesData = useMemo(() => {
    const maxHR = userProfile?.max_hr || (userProfile?.age ? 220 - userProfile.age : 180);

    // Фильтруем активности за последние 6 месяцев
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const last6MonthsRides = rides.filter(a => {
      const activityDate = new Date(a.start_date);
      return activityDate >= sixMonthsAgo;
    });

    const zones = [
      {name: 'Zone 1 (Recovery)', min: maxHR * 0.5, max: maxHR * 0.6, color: '#22c55e'},
      {name: 'Zone 2 (Endurance)', min: maxHR * 0.6, max: maxHR * 0.7, color: '#84cc16'},
      {name: 'Zone 3 (Tempo)', min: maxHR * 0.7, max: maxHR * 0.8, color: '#eab308'},
      {name: 'Zone 4 (Threshold)', min: maxHR * 0.8, max: maxHR * 0.9, color: '#f97316'},
      {name: 'Zone 5 (VO2 Max)', min: maxHR * 0.9, max: maxHR, color: '#ef4444'},
    ];

    // Подсчитываем МИНУТЫ в каждой зоне (упрощенная версия - используем avg HR + moving_time)
    const zoneTimes = zones.map(zone => {
      const timeInMinutes = last6MonthsRides
        .filter(a => a.average_heartrate >= zone.min && a.average_heartrate < zone.max)
        .reduce((sum, a) => sum + (a.moving_time || 0), 0) / 60; // moving_time в секундах -> минуты
      
      return {
        name: zone.name,
        time: Math.round(timeInMinutes),
        color: zone.color,
      };
    });

    return zoneTimes.filter(z => z.time > 0);
  }, [rides, userProfile]);

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
    color: () => `rgba(126, 170, 255, 1)`,
    labelColor: () => `rgba(176, 184, 201, 1)`,
    fillShadowGradient: 'rgba(126, 170, 255, 1)',
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

  // Render Donut Chart
  const renderDonutChart = (data: any[]) => {
    const total = data.reduce((sum, zone) => sum + zone.time, 0);
    const size = 150;
    const strokeWidth = 45;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    
    let accumulatedPercentage = 0;
    
    return (
      <Svg width={size} height={size}>
        {data.map((zone, index) => {
          const percentage = (zone.time / total) * 100;
          const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
          const rotation = (accumulatedPercentage / 100) * 360 - 90;
          
          const circle = (
            <Circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={zone.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={strokeDasharray}
              rotation={rotation}
              origin={`${size / 2}, ${size / 2}`}
              strokeLinecap="butt"
            />
          );
          
          accumulatedPercentage += percentage;
          return circle;
        })}
      </Svg>
    );
  };

  if (!rides || rides.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>HEART</Text>
        <Text style={styles.noDataText}>Not enough data for heart analysis</Text>
      </View>
    );
  }

  // Tooltip renderers
  const renderHRSpeedTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const index = item.index;
    
    // Trigger haptic only once per point
    if (hapticTriggeredRef.current.hrSpeed !== index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current.hrSpeed = index;
    }
    
    const hrValue = hrVsSpeedData.datasets[0].data[index];
    const speedValue = (hrVsSpeedData.datasets[1].data[index] / 5).toFixed(1);
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>Activity {index + 1}</Text>
        <Text style={styles.tooltipDate}>{hrVsSpeedData.labels[index]}</Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg HR:</Text>
          <Text style={styles.tooltipValue}>{hrValue} bpm</Text>
        </View>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg Speed:</Text>
          <Text style={styles.tooltipValue}>{speedValue} km/h</Text>
        </View>
      </View>
    );
  };

  const renderHRTrendTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const index = item.index;
    
    if (hapticTriggeredRef.current.hrTrend !== index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current.hrTrend = index;
    }
    
    const hrValue = avgHRTrendData.datasets[0].data[index];
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>Week {avgHRTrendData.labels[index]}</Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Avg HR:</Text>
          <Text style={styles.tooltipValue}>{hrValue} bpm</Text>
        </View>
      </View>
    );
  };

  const renderMaxHRTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const index = item.index;
    
    if (hapticTriggeredRef.current.maxHR !== index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current.maxHR = index;
    }
    
    const maxHRValue = maxHRPerWeekData.datasets[0].data[index];
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>Week {maxHRPerWeekData.labels[index]}</Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Max HR:</Text>
          <Text style={styles.tooltipValue}>{maxHRValue} bpm</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>HEART</Text>

      {/* Статистика пульса */}
      {heartRateStats && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
          style={styles.statsScroll}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{heartRateStats.avg}</Text>
            <Text style={styles.statLabel}>Avg HR (bpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{heartRateStats.min}</Text>
            <Text style={styles.statLabel}>Min HR (bpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{heartRateStats.max}</Text>
            <Text style={styles.statLabel}>Max HR (bpm)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{heartRateStats.total}</Text>
            <Text style={styles.statLabel}>Total Workouts</Text>
          </View>
        </ScrollView>
      )}

      <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
        {/* 1. HR vs Speed */}
        {hrVsSpeedData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Avg Heart Rate vs Avg Speed</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={hrVsSpeedData.datasets[0].data.map((value: number, index: number) => ({
                  value: value,
                  index: index,
                }))}
                data2={hrVsSpeedData.datasets[1].data.map((value: number, index: number) => ({
                  value: value,
                  index: index,
                }))}
                width={screenWidth - 2}
                height={180}
                maxValue={Math.max(...hrVsSpeedData.datasets[0].data, ...hrVsSpeedData.datasets[1].data) * 1.1}
                noOfSections={4}
                curved
                areaChart
                startFillColor="#FF5E00"
                startOpacity={0.2}
                endOpacity={0}
                areaChart2
                startFillColor2="#00B2FF"
                startOpacity2={0}
                endOpacity2={0}
                spacing={Math.floor((screenWidth - 65) / Math.max(hrVsSpeedData.datasets[0].data.length - 1, 1))}
                color="#FF5E00"
                color2="#00B2FF"
                thickness={3}
                thickness2={3}
                hideDataPoints={false}
                hideDataPoints2={false}
                dataPointsColor="#FF5E00"
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
                  pointerStripColor: '#FF5E00',
                  pointerStripWidth: 2,
                  pointerColor: '#FF5E00',
                  radius: 6,
                  pointerLabelWidth: 140,
                  pointerLabelHeight: 150,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: renderHRSpeedTooltip,
                }}
              />
            </View>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#FF5E00'}]} />
                <Text style={styles.legendText}>Avg HR</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, {backgroundColor: '#00B2FF'}]} />
                <Text style={styles.legendText}>Avg Speed (km/h)</Text>
              </View>
            </View>
            <Text style={styles.chartDescription}>
              Speed is scaled ×5 for visualization
            </Text>
          </View>
        )}

        {/* 2. Average HR Trend */}
        {avgHRTrendData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Average Heart Rate Trend (Weekly)</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={avgHRTrendData.datasets[0].data.map((value: number, index: number) => ({
                  value: value,
                  index: index,
                }))}
                width={screenWidth - 2}
                height={220}
                maxValue={Math.max(...avgHRTrendData.datasets[0].data) * 1.1}
                noOfSections={4}
                curved
                areaChart
                startFillColor="#FF5E00"
                startOpacity={0.2}
                endOpacity={0}
                spacing={Math.floor((screenWidth - 65) / Math.max(avgHRTrendData.datasets[0].data.length - 1, 1))}
                color="#FF5E00"
                thickness={3}
                hideDataPoints={false}
                dataPointsColor="#FF5E00"
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
                  pointerStripColor: '#FF5E00',
                  pointerStripWidth: 2,
                  pointerColor: '#FF5E00',
                  radius: 6,
                  pointerLabelWidth: 120,
                  pointerLabelHeight: 120,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: renderHRTrendTooltip,
                }}
              />
            </View>
          </View>
        )}

        {/* 3. Max HR per Week */}
        {maxHRPerWeekData.labels.length > 1 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Max Heart Rate per Week</Text>
            <View style={styles.chartContainer}>
              <BarChart
                data={maxHRPerWeekData.datasets[0].data.map((value: number, index: number) => ({
                  value: value,
                  label: maxHRPerWeekData.labels[index],
                  frontColor: '#FF5E00',
                  onPress: () => {
                    ReactNativeHapticFeedback.trigger("impactLight", {
                      enableVibrateFallback: true,
                    });
                  },
                }))}
                width={screenWidth - 60}
                height={220}
                maxValue={Math.max(...maxHRPerWeekData.datasets[0].data) * 1.1}
                noOfSections={4}
                barWidth={Math.max(8, Math.floor((screenWidth - 100) / maxHRPerWeekData.datasets[0].data.length) - 4)}
                barBorderRadius={0}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor="#333"
                yAxisTextStyle={{color: '#888', fontSize: 11}}
                xAxisLabelTextStyle={{color: '#888', fontSize: 9, width: 30}}
                rulesColor="#333"
                rulesThickness={1}
                hideRules={false}
                initialSpacing={15}
                isAnimated
                animationDuration={300}
                showScrollIndicator
                renderTooltip={(item: any) => {
                  if (!item) return null;
                  
                  if (hapticTriggeredRef.current.maxHR !== item.index) {
                    ReactNativeHapticFeedback.trigger("impactLight", {
                      enableVibrateFallback: true,
                    });
                    hapticTriggeredRef.current.maxHR = item.index;
                  }
                  
                  return (
                    <View style={styles.chartTooltip}>
                      <Text style={styles.tooltipTitle}>Week {item.label}</Text>
                      <View style={styles.tooltipRow}>
                        <Text style={styles.tooltipLabel}>Max HR:</Text>
                        <Text style={styles.tooltipValue}>{item.value} bpm</Text>
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          </View>
        )}

        {/* 4. HR Zones Distribution */}
        {hrZonesData.length > 0 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>
              Load Distribution by Heart Rate Zones
            </Text>
            <Text style={styles.periodLabel}>Period: 6 months</Text>
            
            <View style={styles.donutChartContainer}>
              {/* Donut Chart */}
              <View style={styles.donutChart}>
                {renderDonutChart(hrZonesData)}
              </View>
              
              {/* Legend */}
              <View style={styles.zonesLegend}>
                {hrZonesData.map((zone, index) => (
                  <View key={index} style={styles.legendRow}>
                    <View style={[styles.legendColorDot, {backgroundColor: zone.color}]} />
                    <Text style={styles.legendZoneName}>{zone.name}</Text>
                    <Text style={styles.legendZoneValue}>{zone.time} min</Text>
                  </View>
                ))}
              </View>
            </View>
          
            <Text style={styles.chartDescription}>
              Zones based on Max HR: {userProfile?.max_hr || (userProfile?.age ? 220 - userProfile.age : 180)} bpm
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
    borderLeftColor: '#FF5E00',
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
    marginBottom: 4,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  periodLabel: {
    fontSize: 12,
    color: '#b0b8c9',
    marginBottom: 12,
  },
  chart: {
    borderRadius: 12,
    marginVertical: 8,
   
  },
  donutChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    gap: 24,
  },
  donutChart: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonesLegend: {
    flex: 1,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendZoneName: {
    fontSize: 10,
    color: '#f6f8ff',
    flex: 1,
  },
  legendZoneValue: {
    fontSize: 12,
    color: '#b0b8c9',
    fontWeight: '600',
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

