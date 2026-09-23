import React, {useMemo, useRef, useState, useCallback} from 'react';
import {View, Text, Dimensions, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {getDateLocaleShort} from '../i18n/dateLocale';
import {LineChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {makeStyles, useTheme, withOpacity, type Theme} from '../theme';

interface ProgressData {
  avg: number;
  all: number[];
  start?: Date;
  end?: Date;
}

interface ProgressChartProps {
  data: ProgressData[];
  onHelpPress?: (topicId: string) => void;
}

const getCategory = (score: number, theme: Theme) => {
  if (score >= 80) return {labelKey: 'excellent', color: theme.colors.successStrong};
  if (score >= 65) return {labelKey: 'good', color: theme.colors.score.good};
  if (score >= 50) return {labelKey: 'steady', color: theme.colors.warning};
  if (score >= 30) return {labelKey: 'low', color: theme.colors.score.low};
  return {labelKey: 'offPlan', color: theme.colors.danger};
};

const getValueColor = (value: number, theme: Theme) => {
  if (value >= 80) return theme.colors.successStrong;
  if (value >= 65) return theme.colors.score.good;
  if (value >= 50) return theme.colors.warning;
  if (value >= 30) return theme.colors.score.low;
  return theme.colors.danger;
};

const BREAKDOWN_LABEL_KEYS = [
  'flatSpeed',
  'hillSpeed',
  'hrZones',
  'longRides',
  'easyRides',
] as const;

const formatDate = (date?: Date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString(getDateLocaleShort(), {
    day: '2-digit',
    month: '2-digit',
  });
};

export const ProgressChart: React.FC<ProgressChartProps> = ({data, onHelpPress}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const axisTextStyle = {color: theme.colors.chart.axisTextLight, fontSize: 11};
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
  const displayCategory = getCategory(displayScore, theme);
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
          <Text style={styles.emptyText}>{t('progress.noData')}</Text>
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
            {isInteracting ? <Text style={styles.blockLabel}>{t('progress.blockLabel', {index: displayIndex + 1})}</Text> : null}
            <Text style={styles.periodText}>
              {isInteracting ? '' : t('progress.period')}
              {formatDate(displayPeriod.start)} –{' '}
              {formatDate(displayPeriod.end)}
            </Text>
          </View>
        </View>

      </View>

      {/* Chart + overlay breakdown */}
      <View style={styles.chartWrapper}>
        {/* Breakdown overlay — floats on top of chart, no layout shift */}
        {isInteracting ? <View style={styles.breakdownOverlay}>
            {(displayPeriod.all || []).map((value: number, idx: number) => (
              <View key={idx} style={styles.breakdownItem}>
                <Text
                  style={[
                    styles.breakdownValue,
                    {color: getValueColor(value, theme)},
                  ]}>
                  {value}%
                </Text>
                <Text style={styles.breakdownLabel}>
                  {BREAKDOWN_LABEL_KEYS[idx] ? t(`progress.${BREAKDOWN_LABEL_KEYS[idx]}`) : ''}
                </Text>
              </View>
            ))}
          </View> : null}

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
          startFillColor={theme.colors.chart.progressLine}
          startOpacity={0.4}
          endOpacity={0.2}
          spacing={Math.floor(
            (screenWidth - 80) / Math.max(data.length - 1, 1),
          )}
          color={theme.colors.chart.progressLine}
          thickness={3}
          hideDataPoints={false}
          dataPointsColor={theme.colors.chart.progressLine}
          dataPointsRadius={1}
          textColor1={theme.colors.chart.axisTextLight}
          textFontSize={11}
          xAxisColor={theme.colors.chart.axisLineLight}
          yAxisColor="transparent"
          xAxisThickness={0.5}
          yAxisThickness={0}
          rulesColor={theme.colors.chart.axisLineLight}
          rulesThickness={0.5}
          yAxisTextStyle={axisTextStyle}
          xAxisLabelTextStyle={axisTextStyle}
          hideRules={false}
          showVerticalLines={false}
          verticalLinesColor="transparent"
          initialSpacing={10}
          endSpacing={10}
          pointerConfig={{
            pointerStripHeight: 160,
            pointerStripColor: theme.colors.chart.progressLine,
            pointerStripWidth: 2,
            pointerColor: theme.colors.chart.progressLine,
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
            <Text style={styles.categoryLabel}>{t('progress.effortRate')}</Text>
            <View
              style={[
                styles.categoryBadge,
                {borderColor: displayCategory.color},
              ]}>
              <Text
                style={[styles.categoryText, {color: displayCategory.color}]}>
                {t(`progress.${displayCategory.labelKey}`)}
              </Text>
            </View>
            {onHelpPress ? <TouchableOpacity
                style={styles.helpButton}
                onPress={() => onHelpPress('effort_rate')}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={styles.helpIcon}>?</Text>
              </TouchableOpacity> : null}
          </View>
        </View>
        <Text style={styles.description}>
          {t('progress.effortRateHint')}
        </Text>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    backgroundColor: theme.colors.surfaceLight,
    padding: 16,
    overflow: 'visible',
    zIndex: 1,
    paddingBottom: 28,
    paddingTop: 20,
    marginBottom: 8,
    marginHorizontal: 8,
    borderRadius: 30,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 18, height: 20},
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 3,
  },
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withOpacity(theme.colors.black, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.faint,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.text.muted,
  },

  // Header / detail area
  header: {
    marginBottom: 16,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerActive: {
    backgroundColor: withOpacity(theme.colors.chart.progressLine, 0.06),
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
    color: theme.colors.text.primary,
    letterSpacing: -3,
  },
  scoreUnit: {
    fontSize: 20,
    color: theme.colors.text.primary,
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
    color: theme.colors.successStrong,
  },
  deltaNegative: {
    color: theme.colors.danger,
  },
  periodInfo: {
    alignItems: 'flex-end',
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.chart.progressLine,
    marginBottom: 2,
  },
  periodText: {
    fontSize: 12,
    color: theme.colors.text.muted,
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
    backgroundColor: withOpacity(theme.colors.surfaceLight, 0.92),
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: withOpacity(theme.colors.black, 0.03),
  },
  breakdownValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  breakdownLabel: {
    fontSize: 9,
    color: theme.colors.text.muted,
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
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    lineHeight: 18,
  },
}));
