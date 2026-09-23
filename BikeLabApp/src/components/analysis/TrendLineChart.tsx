// T-5.3 (A-24/A-28): the single most duplicated piece across the five
// *Analysis components — a title row with an optional help button, a
// scrub-to-reveal (line) or tap-to-reveal (bar) detail overlay, and a
// react-native-gifted-charts chart underneath. See README.md for exactly
// which numeric knobs (margins/offsets/noOfSections/...) differ per
// original call site and why they're exposed as props here instead of
// being folded away.
import React, {useCallback, useRef, useState} from 'react';
import {View, Text, Dimensions, TouchableOpacity} from 'react-native';
import {LineChart, BarChart} from 'react-native-gifted-charts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import type {ChartOverlayApi} from './types';
import {makeStyles, useTheme, withOpacity} from '../../theme';

const screenWidth = Dimensions.get('window').width;

function spacingFor(length: number): number {
  return Math.floor((screenWidth - 65) / Math.max(length - 1, 1));
}

// --- Detail overlays ------------------------------------------------------

export interface SimpleChartDetailProps {
  /** Background color — always the chart's own line/bar color in the
   * original components. */
  color: string;
  title: string;
  primaryValue: string | number;
  primaryLabel: string;
  secondaryValue?: string | number;
  secondaryLabel?: string;
  /** Heart's line charts used -60; Speed/Cadence's used -65. */
  topOffset?: number;
}

/** The "Week{n}" / "Activity{n} • {date}" pill overlay used by every
 * Heart/Speed/Cadence chart (line and bar alike). */
export const SimpleChartDetail: React.FC<SimpleChartDetailProps> = ({
  color,
  title,
  primaryValue,
  primaryLabel,
  secondaryValue,
  secondaryLabel,
  topOffset = -65,
}) => (
  <View style={[styles.simpleOverlay, {top: topOffset, backgroundColor: color}]}>
    <Text style={styles.simpleTitle} numberOfLines={1}>
      {title}
    </Text>
    <View style={styles.simpleValues}>
      <Text style={styles.simplePillValue}>{primaryValue}</Text>
      <Text style={styles.simplePillLabel}>{primaryLabel}</Text>
      {secondaryValue !== undefined && (
        <>
          <View style={styles.simpleDivider} />
          <Text style={styles.simplePillValue}>{secondaryValue}</Text>
          <Text style={styles.simplePillLabel}>{secondaryLabel}</Text>
        </>
      )}
    </View>
  </View>
);

export interface RichChartDetailProps {
  title: string;
  subtitle: string;
  value: string | number;
  unit: string;
  pills: {value: string; label: string}[];
  accentColor?: string;
}

/** PowerAnalysis's richer overlay: activity name/date on the left, the big
 * value on the right, a row of extra pills (speed, "has wind") below. */
export const RichChartDetail: React.FC<RichChartDetailProps> = ({
  title,
  subtitle,
  value,
  unit,
  pills,
  accentColor,
}) => {
  const theme = useTheme();
  const resolvedAccentColor = accentColor ?? theme.colors.chart.powerAccent;
  return (
  <View style={[styles.richOverlay, {borderLeftColor: resolvedAccentColor}]}>
    <View style={styles.richHeader}>
      <View style={styles.richLeft}>
        <Text style={styles.richTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.richSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.richRight}>
        <Text style={styles.richValue}>{value}</Text>
        <Text style={styles.richUnit}>{unit}</Text>
      </View>
    </View>
    {pills.length > 0 && (
      <View style={styles.richPillRow}>
        {pills.map((pill, index) => (
          <View key={index} style={styles.richPill}>
            <Text style={styles.richPillValue}>{pill.value}</Text>
            <Text style={styles.richPillLabel}>{pill.label}</Text>
          </View>
        ))}
      </View>
    )}
  </View>
  );
};

// --- Chart shell (title row + help button + scrub overlay slot) -----------

export interface TrendLineChartLegendItem {
  color: string;
  label: string;
}

export interface TrendLineChartProps {
  title: string;
  onHelpPress?: () => void;
  data: number[];
  data2?: number[];
  color: string;
  color2?: string;
  height?: number;
  noOfSections?: number;
  pointerStripHeight?: number;
  overlay: ChartOverlayApi;
  /** Rendered inside the scrub overlay slot while `overlay.isInteracting`. */
  detail?: React.ReactNode;
  legend?: TrendLineChartLegendItem[];
  description?: string;
  titleColor?: string;
  titleMarginTop?: number;
  titleMarginBottom?: number;
  titleLetterSpacing?: number;
  titleTextTransform?: 'uppercase' | 'none';
  helpButtonMarginTop?: number;
  blockZIndex?: number;
  blockMarginBottom?: number;
  wrapperMarginTop?: number;
  containerMarginTop?: number;
}

export const TrendLineChart: React.FC<TrendLineChartProps> = ({
  title,
  onHelpPress,
  data,
  data2,
  color,
  color2,
  height = 220,
  noOfSections = 4,
  pointerStripHeight = 180,
  overlay,
  detail,
  legend,
  description,
  titleColor,
  titleMarginTop = 32,
  titleMarginBottom = 12,
  titleLetterSpacing = 0,
  titleTextTransform = 'uppercase',
  helpButtonMarginTop = 24,
  blockZIndex = 1,
  blockMarginBottom = 24,
  wrapperMarginTop = 12,
  containerMarginTop = 4,
}) => {
  const theme = useTheme();
  const resolvedTitleColor = titleColor ?? theme.colors.text.inverse;
  const resolvedTitleTransform = titleTextTransform === 'uppercase' ? 'uppercase' : 'none';
  const axisTextStyle = {color: theme.colors.text.muted, fontSize: 11};
  const maxValue = Math.max(...data, ...(data2 ?? [0])) * 1.1;

  return (
    <View
      style={[styles.block, {zIndex: blockZIndex, marginBottom: blockMarginBottom}]}
      onTouchStart={overlay.onTouchStart}
      onTouchEnd={overlay.clear}
      onTouchCancel={overlay.clear}>
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.chartTitle,
            {
              color: resolvedTitleColor,
              marginTop: titleMarginTop,
              marginBottom: titleMarginBottom,
              letterSpacing: titleLetterSpacing,
              textTransform: resolvedTitleTransform,
            },
          ]}>
          {title}
        </Text>
        {onHelpPress ? <TouchableOpacity
            style={[styles.helpButton, {marginTop: helpButtonMarginTop}]}
            onPress={onHelpPress}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={styles.helpIcon}>?</Text>
          </TouchableOpacity> : null}
      </View>
      <View style={[styles.wrapper, {marginTop: wrapperMarginTop}]}>
        {overlay.isInteracting && overlay.activeIndex !== null ? detail : null}
        <View style={[styles.container, {marginTop: containerMarginTop}]}>
          <LineChart
            data={data.map((value, index) => ({value, index}))}
            data2={data2 ? data2.map((value, index) => ({value, index})) : undefined}
            width={screenWidth - 2}
            height={height}
            maxValue={maxValue}
            noOfSections={noOfSections}
            curved
            areaChart
            startFillColor={color}
            startOpacity={0.2}
            endOpacity={0}
            areaChart2={!!data2}
            startFillColor2={color2}
            startOpacity2={0}
            endOpacity2={0}
            spacing={spacingFor(data.length)}
            color={color}
            color2={color2}
            thickness={3}
            thickness2={data2 ? 3 : undefined}
            hideDataPoints={false}
            hideDataPoints2={data2 ? false : undefined}
            dataPointsColor={color}
            dataPointsColor2={color2}
            dataPointsRadius={1}
            dataPointsRadius2={data2 ? 1 : undefined}
            textColor1={theme.colors.text.muted}
            textFontSize={11}
            xAxisColor={theme.colors.chart.axisLine}
            yAxisColor="transparent"
            xAxisThickness={1}
            yAxisThickness={0}
            rulesColor={theme.colors.chart.axisLine}
            rulesThickness={1}
            yAxisTextStyle={axisTextStyle}
            xAxisLabelTextStyle={axisTextStyle}
            hideRules={false}
            showVerticalLines={false}
            verticalLinesColor="transparent"
            initialSpacing={10}
            endSpacing={10}
            pointerConfig={overlay.getPointerConfig(color, pointerStripHeight)}
          />
        </View>
      </View>
      {legend ? <View style={styles.legendContainer}>
          {legend.map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendDot, {backgroundColor: item.color}]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
};

// --- Bar chart shell (tap-to-reveal, its own timeout-based state) ---------

export interface TrendBarChartProps {
  title: string;
  onHelpPress?: () => void;
  data: number[];
  labels: string[];
  color: string;
  height?: number;
  noOfSections?: number;
  detailTitlePrefix: string;
  detailUnitLabel: string;
  titleColor?: string;
  titleMarginTop?: number;
  titleMarginBottom?: number;
  titleTextTransform?: 'uppercase' | 'none';
  helpButtonMarginTop?: number;
  blockZIndex?: number;
  wrapperMarginTop?: number;
  containerMarginTop?: number;
  detailTopOffset?: number;
  /** Heart's bars leave 4px of the computed slot as gap; Speed's leave 12. */
  barWidthGap?: number;
  xAxisLabelWidth?: number;
  initialSpacing?: number;
}

export const TrendBarChart: React.FC<TrendBarChartProps> = ({
  title,
  onHelpPress,
  data,
  labels,
  color,
  height = 220,
  noOfSections = 4,
  detailTitlePrefix,
  detailUnitLabel,
  titleColor,
  titleMarginTop = 32,
  titleMarginBottom = 12,
  titleTextTransform = 'uppercase',
  helpButtonMarginTop = 24,
  blockZIndex = 1,
  wrapperMarginTop = 12,
  containerMarginTop = 4,
  detailTopOffset = -65,
  barWidthGap = 4,
  xAxisLabelWidth,
  initialSpacing,
}) => {
  const theme = useTheme();
  const resolvedTitleColor = titleColor ?? theme.colors.text.inverse;
  const resolvedTitleTransform = titleTextTransform === 'uppercase' ? 'uppercase' : 'none';
  const yAxisTextStyle = {color: theme.colors.text.muted, fontSize: 11};
  const xAxisLabelStyle = xAxisLabelWidth
    ? {color: theme.colors.text.muted, fontSize: 9, width: xAxisLabelWidth}
    : {color: theme.colors.text.muted, fontSize: 9};
  const [activeBar, setActiveBar] = useState<{label: string; value: number} | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBarPress = useCallback((label: string, value: number) => {
    ReactNativeHapticFeedback.trigger('impactLight', {enableVibrateFallback: true});
    setActiveBar({label, value});
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setActiveBar(null), 3000);
  }, []);

  const maxValue = Math.max(...data) * 1.1;
  const barWidth = Math.max(8, Math.floor((screenWidth - 100) / data.length) - barWidthGap);

  return (
    <View style={[styles.block, {zIndex: blockZIndex}]}>
      <View style={styles.titleRow}>
        <Text
          style={[
            styles.chartTitle,
            {
              color: resolvedTitleColor,
              marginTop: titleMarginTop,
              marginBottom: titleMarginBottom,
              textTransform: resolvedTitleTransform,
            },
          ]}>
          {title}
        </Text>
        {onHelpPress ? <TouchableOpacity
            style={[styles.helpButton, {marginTop: helpButtonMarginTop}]}
            onPress={onHelpPress}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={styles.helpIcon}>?</Text>
          </TouchableOpacity> : null}
      </View>
      <View style={[styles.wrapper, {marginTop: wrapperMarginTop}]}>
        {activeBar ? <SimpleChartDetail
            color={color}
            title={`${detailTitlePrefix}${activeBar.label}`}
            primaryValue={activeBar.value}
            primaryLabel={detailUnitLabel}
            topOffset={detailTopOffset}
          /> : null}
        <View style={[styles.container, {marginTop: containerMarginTop}]}>
          <BarChart
            data={data.map((value, index) => ({
              value,
              label: labels[index],
              frontColor: color,
              onPress: () => handleBarPress(labels[index], value),
            }))}
            width={screenWidth - 60}
            height={height}
            maxValue={maxValue}
            noOfSections={noOfSections}
            barWidth={barWidth}
            barBorderRadius={0}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={theme.colors.chart.axisLine}
            yAxisTextStyle={yAxisTextStyle}
            xAxisLabelTextStyle={xAxisLabelStyle}
            rulesColor={theme.colors.chart.axisLine}
            rulesThickness={1}
            hideRules={false}
            initialSpacing={initialSpacing}
            isAnimated
            animationDuration={300}
            showScrollIndicator
          />
        </View>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  helpIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.secondary,
  },
  block: {
    marginBottom: 24,
    overflow: 'visible',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  wrapper: {
    position: 'relative',
  },
  container: {
    paddingHorizontal: 16,
    marginLeft: -24,
    overflow: 'visible',
    zIndex: 100,
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
    color: theme.colors.chart.legendTextOnDark,
  },
  description: {
    fontSize: 11,
    color: theme.colors.chart.caption,
    marginTop: 8,
    textAlign: 'center',
  },
  // Simple overlay (Heart/Speed/Cadence)
  simpleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 100,
  },
  simpleTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.inverse,
    marginRight: 12,
  },
  simpleValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  simpleDivider: {
    width: 1,
    height: 12,
    backgroundColor: withOpacity(theme.colors.black, 0.15),
    marginHorizontal: 6,
    alignSelf: 'center',
  },
  simplePillValue: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  simplePillLabel: {
    fontSize: 12,
    color: theme.colors.text.inverse,
    fontWeight: '500',
  },
  // Rich overlay (Power)
  richOverlay: {
    position: 'absolute',
    top: -108,
    left: 0,
    right: 0,
    zIndex: 2000,
    backgroundColor: theme.colors.chart.richOverlayBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    borderLeftWidth: 3,
  },
  richHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  richLeft: {
    flex: 1,
    marginRight: 12,
  },
  richRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  richTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  richSubtitle: {
    fontSize: 11,
    color: theme.colors.text.muted,
    marginTop: 2,
  },
  richValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text.inverse,
    letterSpacing: -1,
  },
  richUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.muted,
    marginLeft: 2,
  },
  richPillRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 0,
    flexWrap: 'wrap',
  },
  richPill: {
    alignItems: 'flex-start',
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.05),
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 48,
  },
  richPillValue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  richPillLabel: {
    fontSize: 8,
    color: theme.colors.text.secondary,
    marginTop: 1,
    textTransform: 'uppercase',
  },
}));
