import React, {useMemo, useRef, useState, useCallback} from 'react';
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

const getValueColor = (value: number) => {
  if (value >= 80) return '#16a34a';
  if (value >= 65) return '#3b82f6';
  if (value >= 50) return '#f59e0b';
  if (value >= 30) return '#f97316';
  return '#ef4444';
};

const BREAKDOWN_LABELS = [
  'Flat Speed',
  'Hill Speed',
  'HR Zones',
  'Long Rides',
  'Easy Rides',
];

const formatDate = (date?: Date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
  });
};

export const ProgressChart: React.FC<ProgressChartProps> = ({data}) => {
  const hapticTriggeredRef = useRef<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      labels: data.map((_, index) => `${index + 1}`),
      datasets: [
        {
          data: data.map(item => item.avg),
          strokeWidth: 3,
          color: () => 'rgb(61, 155, 249)',
        },
      ],
    };
  }, [data]);

  const lastPeriod = data?.length > 0 ? data[data.length - 1] : null;
  const screenWidth = Dimensions.get('window').width;

  const displayIndex = activeIndex ?? data.length - 1;
  const displayPeriod = data[displayIndex];
  const prevPeriodData = displayIndex > 0 ? data[displayIndex - 1] : null;
  const displayScore = displayPeriod?.avg ?? 0;
  const prevScore = prevPeriodData?.avg ?? null;
  const displayDelta =
    prevScore !== null
      ? Math.round((displayScore - prevScore) * 10) / 10
      : null;
  const displayCategory = getCategory(displayScore);
  const isInteracting = activeIndex !== null;

  const clearInteraction = useCallback(() => {
    dismissedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    activeIndexRef.current = null;
    hapticTriggeredRef.current = null;
    setActiveIndex(null);
  }, []);

  const handleTouchStart = useCallback(() => {
    dismissedRef.current = false;
  }, []);

  const renderPointerLabel = useCallback(
    (items: any) => {
      if (!items || items.length === 0 || dismissedRef.current) {
        return <View />;
      }
      const item = items[0];

      if (hapticTriggeredRef.current !== item.index) {
        ReactNativeHapticFeedback.trigger('impactLight', {
          enableVibrateFallback: true,
        });
        hapticTriggeredRef.current = item.index;
      }

      if (activeIndexRef.current !== item.index) {
        activeIndexRef.current = item.index;
        setTimeout(() => setActiveIndex(item.index), 0);
      }

      // Fallback: auto-clear after finger stops (onTouchEnd may not fire)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        dismissedRef.current = true;
        activeIndexRef.current = null;
        hapticTriggeredRef.current = null;
        setActiveIndex(null);
      }, 800);

      return <View />;
    },
    [],
  );

  if (!chartData || !lastPeriod || !displayPeriod) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data to display</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearInteraction}
      onTouchCancel={clearInteraction}>
      {/* Detail header — Strava-style: updates when scrubbing the chart */}
      <View style={[styles.header, isInteracting && styles.headerActive]}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreValueContainer}>
            <Text style={styles.scoreValue}>{displayScore}</Text>
            <Text style={styles.scoreUnit}>efr</Text>
            {displayDelta !== null && (
              <Text
                style={[
                  styles.scoreDelta,
                  displayDelta >= 0
                    ? styles.deltaPositive
                    : styles.deltaNegative,
                ]}>
                {displayDelta >= 0 ? '▲' : '▼'} {Math.abs(displayDelta)}%
              </Text>
            )}
          </View>
          <View style={styles.periodInfo}>
            {isInteracting && (
              <Text style={styles.blockLabel}>Block {displayIndex + 1}</Text>
            )}
            <Text style={styles.periodText}>
              {isInteracting ? '' : 'Period: '}
              {formatDate(displayPeriod.start)} –{' '}
              {formatDate(displayPeriod.end)}
            </Text>
          </View>
        </View>

      </View>

      {/* Chart + overlay breakdown */}
      <View style={styles.chartWrapper}>
        {/* Breakdown overlay — floats on top of chart, no layout shift */}
        {isInteracting && (
          <View style={styles.breakdownOverlay}>
            {(displayPeriod.all || []).map((value: number, idx: number) => (
              <View key={idx} style={styles.breakdownItem}>
                <Text
                  style={[
                    styles.breakdownValue,
                    {color: getValueColor(value)},
                  ]}>
                  {value}%
                </Text>
                <Text style={styles.breakdownLabel}>
                  {BREAKDOWN_LABELS[idx] ?? ''}
                </Text>
              </View>
            ))}
          </View>
        )}

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
          spacing={Math.floor(
            (screenWidth - 65) / Math.max(data.length - 1, 1),
          )}
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
            pointerLabelWidth: 0,
            pointerLabelHeight: 0,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: false,
            pointerLabelComponent: renderPointerLabel,
          }}
        />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.effortRateContainer}>
          <View style={styles.categoryRow}>
            <Text style={styles.categoryLabel}>Effort rate</Text>
            <View
              style={[
                styles.categoryBadge,
                {borderColor: displayCategory.color},
              ]}>
              <Text
                style={[styles.categoryText, {color: displayCategory.color}]}>
                {displayCategory.label}
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
    paddingTop: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
  },

  // Header / detail area
  header: {
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerActive: {
    backgroundColor: 'rgba(61, 155, 249, 0.06)',
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
  periodInfo: {
    alignItems: 'flex-end',
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3d9bf9',
    marginBottom: 2,
  },
  periodText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },

  // Chart wrapper (holds overlay + chart)
  chartWrapper: {
    position: 'relative',
  },
  breakdownOverlay: {
    position: 'absolute',
    top: 172,
    left: 0,
    right: 0,
    zIndex: 200,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 6,
    backgroundColor: 'rgba(248, 248, 250, 0.92)',
    
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.03)',
    
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  breakdownLabel: {
    fontSize: 9,
    color: '#888',
    marginTop: 2,
    textAlign: 'center',
  },

  // Chart
  chartContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
  },

  // Footer
  footer: {
    marginTop: 8,
    gap: 8,
  },
  effortRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  description: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});
