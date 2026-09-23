// Extracted from RideAnalyticsScreen.tsx (T-5.4 screen decomposition):
// the horizontally-scrolling mini charts (speed/heart rate/cadence/power/
// elevation). Pixel-identical to the original inline JSX/styles; the two
// near-duplicate chart card implementations (one per-stream, one
// hand-written for elevation because it shows total elevation gain
// instead of an average) are now the one `MiniChartCard` below.
import React from 'react';
import {View, Text, ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {LineChart} from 'react-native-gifted-charts';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {prepareChartData, averageOf} from './lib';
import type {StreamData} from '../../utils/streamsCache';
import type {Activity} from '../../types/activity';

// Hoisted out of MiniChartCard (react/no-unstable-nested-components) —
// gifted-charts' `pointerLabelComponent` is called on every pointer move,
// so a function defined inline in render was a fresh component type each
// time, tearing down/remounting the tooltip's subtree on every scrub.
const ChartTooltip: React.FC<{value: number; unit: string}> = ({value, unit}) => (
  <View style={styles.tooltipContainer}>
    <Text style={styles.tooltipText}>
      {value.toFixed(0)} {unit}
    </Text>
  </View>
);

// Also hoisted (not just `ChartTooltip` itself) — gifted-charts'
// `pointerLabelComponent` needs a function, and defining even this thin
// `items => <ChartTooltip .../>` wrapper inline in MiniChartCard's render
// still counts as an unstable nested component.
const makePointerLabelComponent = (unit: string) => (items: any) => (
  <ChartTooltip value={items[0].value} unit={unit} />
);

interface StreamsChartsProps {
  streams: StreamData | null | undefined;
  loading: boolean;
  activity: Activity;
}

interface MiniChartCardProps {
  title: string;
  data: number[];
  color: string;
  unit: string;
  excludeZeros?: boolean;
  /** Overrides the averaged header value (elevation shows total gain
   * instead of an average). */
  headerValueOverride?: string;
  /** Elevation shows "m gain" in the header but plain "m" in the scrub
   * tooltip — this is that original distinction, not a bug. Defaults to
   * `unit`. */
  tooltipUnit?: string;
}

const MiniChartCard: React.FC<MiniChartCardProps> = ({
  title,
  data,
  color,
  unit,
  excludeZeros,
  headerValueOverride,
  tooltipUnit,
}) => {
  if (!data || data.length === 0) return null;

  const chartData = prepareChartData(data);
  const maxValue = Math.max(...data) * 1.1;
  const headerValue = headerValueOverride ?? averageOf(data, excludeZeros).toFixed(0);
  const pointerUnit = tooltipUnit ?? unit;

  return (
    <View style={styles.miniChartCard}>
      <View style={styles.miniChartHeader}>
        <Text style={styles.miniChartTitle}>{title}</Text>
        <Text style={styles.miniChartAvg}>
          {headerValue} <Text style={styles.miniChartUnit}>{unit}</Text>
        </Text>
      </View>
      <View style={styles.miniChartContent}>
        <LineChart
          data={chartData}
          width={231}
          height={100}
          maxValue={maxValue}
          spacing={Math.max(1, Math.floor(250 / chartData.length))}
          curved
          areaChart
          startFillColor={color}
          startOpacity={0.2}
          endOpacity={0}
          color={color}
          thickness={2}
          hideDataPoints
          hideRules
          hideYAxisText
          hideAxesAndRules
          pointerConfig={{
            pointerStripColor: color,
            pointerStripWidth: 2,
            pointerColor: color,
            radius: 4,
            pointerLabelWidth: 55,
            pointerLabelHeight: 30,
            pointerLabelComponent: makePointerLabelComponent(pointerUnit),
          }}
        />
      </View>
    </View>
  );
};

export const StreamsCharts: React.FC<StreamsChartsProps> = ({streams, loading, activity}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  if (!streams || loading) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.miniChartsContainer}
      style={styles.miniChartsScroll}>
      {streams.velocity_smooth?.data ? <MiniChartCard
          title={t('common.speed')}
          data={streams.velocity_smooth.data.map(v => v * 3.6)}
          color={theme.colors.chart.series2}
          unit={t('common.kmh')}
        /> : null}
      {streams.heartrate?.data ? <MiniChartCard
          title={t('common.heartRate')}
          data={streams.heartrate.data}
          color={theme.colors.chart.series3}
          unit={t('common.bpm')}
        /> : null}
      {streams.cadence?.data ? <MiniChartCard
          title={t('common.cadence')}
          data={streams.cadence.data}
          color={theme.colors.chart.series4}
          unit={t('common.rpm')}
          excludeZeros
        /> : null}
      {streams.watts?.data ? <MiniChartCard
          title={t('common.power')}
          data={streams.watts.data}
          color={theme.colors.chart.series6}
          unit={t('common.watts')}
        /> : null}
      {streams.altitude?.data ? <MiniChartCard
          title={t('common.elevation')}
          data={streams.altitude.data}
          color={theme.colors.chart.caption}
          unit={t('rideAnalytics.mGain')}
          tooltipUnit={t('common.m')}
          headerValueOverride={`${Math.round(activity.total_elevation_gain)}`}
        /> : null}
    </ScrollView>
  );
};

const styles = makeStyles(theme => ({
  miniChartsScroll: {
    marginBottom: theme.spacing[16],
  },
  miniChartsContainer: {
    flexDirection: 'row',
    gap: 0,
    paddingLeft: theme.spacing[16],
    paddingHorizontal: 0,
    marginBottom: theme.spacing[16],
    marginTop: theme.spacing[4],
  },
  miniChartCard: {
    width: 212,
    height: 180,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.03),
    padding: 0,
    marginRight: theme.spacing[8],
    borderRadius: theme.radii.md,
  },
  miniChartContent: {
    position: 'relative',
    left: -30,
    top: theme.spacing[10],
  },
  miniChartHeader: {
    marginBottom: theme.spacing[8],
    padding: theme.spacing[16],
    paddingBottom: 0,
  },
  miniChartTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.muted,
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase',
  },
  miniChartAvg: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: '800',
    color: withOpacity(theme.colors.text.inverse, 0.9),
  },
  miniChartUnit: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.muted,
  },
  tooltipContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.chart.axisLine,
    position: 'relative',
    top: 25,
    alignItems: 'center',
    zIndex: 9999,
  },
  tooltipText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
  },
}));
