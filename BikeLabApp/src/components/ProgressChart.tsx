import React, {useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';
import {LineChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface ProgressData {
  avg: number;
  all: number[];
  start?: Date;
  end?: Date;
}

interface ProgressChartProps {
  data: ProgressData[];
}

const getCategory = (score: number) => {
  if (score >= 80) return {label: 'Excellent', color: '#16a34a'};
  if (score >= 65) return {label: 'Good', color: '#3b82f6'};
  if (score >= 50) return {label: 'Steady', color: '#f59e0b'};
  if (score >= 30) return {label: 'Low', color: '#f97316'};
  return {label: 'Off-plan', color: '#ef4444'};
};

export const ProgressChart: React.FC<ProgressChartProps> = ({data}) => {
  const hapticTriggeredRef = useRef<number | null>(null);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const progressValues = data.map(item => item.avg);
    const labels = data.map((_, index) => `${index + 1}`);

    return {
      labels,
      datasets: [
        {
          data: progressValues,
          strokeWidth: 3,
          color: () => `rgb(61, 155, 249)`,
        },
      ],
    };
  }, [data]);

  const lastPeriod = data && data.length > 0 ? data[data.length - 1] : null;
  const prevPeriod =
    data && data.length > 1 ? data[data.length - 2] : null;

  if (!chartData || !lastPeriod) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data to display</Text>
        </View>
      </View>
    );
  }

  const lastScore = lastPeriod.avg;
  const prevScore = prevPeriod ? prevPeriod.avg : null;
  const delta =
    prevScore !== null ? Math.round((lastScore - prevScore) * 10) / 10 : null;
  const category = getCategory(lastScore);

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const screenWidth = Dimensions.get('window').width;

  const breakdownLabels = [
    'Flat Speed',
    'Hill Speed',
    'HR Zones',
    'Long Rides',
    'Easy Rides',
  ];

  // Render tooltip for pointer
  const renderTooltip = (items: any) => {
    if (!items || items.length === 0) return null;
    
    const item = items[0];
    const periodData = data[item.index];
    const category = getCategory(periodData.avg);
    
    // Trigger haptic only once per point
    if (hapticTriggeredRef.current !== item.index) {
      ReactNativeHapticFeedback.trigger("impactLight", {
        enableVibrateFallback: true,
      });
      hapticTriggeredRef.current = item.index;
    }
    
    return (
      <View style={styles.chartTooltip}>
        <Text style={styles.tooltipTitle}>
          Block {item.index + 1}
        </Text>
        <Text style={styles.tooltipDate}>
          {formatDate(periodData.start)} – {formatDate(periodData.end)}
        </Text>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Effort rate:</Text>
          <Text style={styles.tooltipValue}>{periodData.avg}%</Text>
        </View>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipLabel}>Status:</Text>
          <Text style={[styles.tooltipValue, {color: category.color}]}>
            {category.label}
          </Text>
        </View>
        <View style={styles.tooltipBreakdown}>
          {periodData.all.map((value: number, index: number) => (
            <View key={index} style={styles.tooltipBreakdownRow}>
              <Text style={styles.tooltipBreakdownLabel}>
                {breakdownLabels[index]}:
              </Text>
              <Text style={styles.tooltipBreakdownValue}>{value}%</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Score */}
      <View style={styles.header}>
        <View style={styles.scoreContainer}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreValueContainer}>
            <Text style={styles.scoreValue}>{lastScore}</Text>
            <Text style={styles.scoreUnit}>efr</Text>
            {delta !== null && (
              <Text
                style={[
                  styles.scoreDelta,
                  delta >= 0 ? styles.deltaPositive : styles.deltaNegative,
                ]}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
              </Text>
            )}
            </View>
           
             <Text style={styles.periodText}>
                Period: {formatDate(lastPeriod.start)} – {formatDate(lastPeriod.end)}
            </Text>
          </View>
          
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={data.map((item, index) => ({
            value: item.avg,
            label: `${index + 1}`,
            index: index,
          }))}
          width={screenWidth - 2}
          height={180}
          maxValue={100}
          noOfSections={4}
          curved
          areaChart
          startFillColor="#3d9bf9"
          startOpacity={0.4}
          endOpacity={0.2}
          spacing={Math.floor((screenWidth - 65) / Math.max(data.length - 1, 1))}
          color="#3d9bf9"
          thickness={3}
          hideDataPoints={false}
          dataPointsColor="#3d9bf9"
          dataPointsRadius={1}
          textColor1="#94a3b8"
          textFontSize={11}
          xAxisColor="#e1e1e1"
          yAxisColor="transparent"
          xAxisThickness={0.5}
          yAxisThickness={0}
          rulesColor="#e1e1e1"
          rulesThickness={0.5}
          yAxisTextStyle={{color: '#94a3b8', fontSize: 11}}
          xAxisLabelTextStyle={{color: '#94a3b8', fontSize: 11}}
          hideRules={false}
          showVerticalLines={false}
          verticalLinesColor="transparent"
          initialSpacing={10}
          endSpacing={10}
          pointerConfig={{
            pointerStripHeight: 160,
            pointerStripColor: '#3d9bf9',
            pointerStripWidth: 2,
            pointerColor: '#3d9bf9',
            radius: 6,
            pointerLabelWidth: 120,
            pointerLabelHeight: 200,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelComponent: renderTooltip,
          }}
        />
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <View style={styles.effortRateContainer}>
            <View style={styles.categoryRow}>
                <Text style={styles.categoryLabel}>Effort rate</Text>
                <View
                style={[styles.categoryBadge, {borderColor: category.color}]}>
                <Text style={[styles.categoryText, {color: category.color}]}>
                    {category.label}
                </Text>
                </View>
           </View>
       
          </View>
      
        <Text style={styles.description}>
          Rate shows % completion per block. Higher is better; 70%+ indicates
          consistent adherence.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f8fa',
    padding: 16,
    overflow: 'visible',
    zIndex: 1,
    paddingBottom: 32,
    paddingTop: 20
  },
  effortRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
  },
  chartTooltip: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    minWidth: 180,
    borderLeftWidth: 3,
    borderLeftColor: '#3d9bf9',
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
  tooltipBreakdown: {
    marginTop: 8,
    gap: 3,
  },
  tooltipBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipBreakdownLabel: {
    fontSize: 10,
    color: '#888',
  },
  tooltipBreakdownValue: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    marginBottom: 16,
  },
  scoreContainer: {
    gap: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoreValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -3,
  },
  scoreUnit: {
    fontSize: 20,
    color: '#1a1a1a',
    fontWeight: '800',
    marginTop: 20,
  },
  scoreDelta: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginLeft: 8,
  },
  deltaPositive: {
    color: '#16a34a',
  },
  deltaNegative: {
    color: '#ef4444',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },
  chart: {
    borderRadius: 0,
  },
  footer: {
    marginTop: 8,
    gap: 8,
  },
  periodText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});


