import React, {useMemo} from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import {colors, makeStyles, useTheme} from '../../theme';
import {CoachCard, StatusPill} from './CoachCardChrome';
import {
  buildTrendChartPaths,
  computeOvertrainingRate,
  getOvertrainingRiskLevel,
  selectTrendSeries,
  type TrendActivity,
} from '@bikelab/shared/calc';
import type {OvertrainingRiskLevel} from '@bikelab/shared/constants';

// HR-vs-speed fatigue/overtraining chart for the coach chat — shown whenever
// analyze_readiness or get_oura_readiness fires, or on the first ride
// analysis of a conversation (see ChatMessageBubble.tsx's
// showOvertrainingTrend; built from the rider's own activities alone, never
// gated on any health-data connection). Hand-rolled react-native-svg chart
// (smooth bezier + gradient area/stroke) matching the "Rich Chat Cards v2"
// style reference. The numbers — ride selection, divergence-based risk, the
// shared-scale path geometry — come from @bikelab/shared/calc so web draws
// the same chart; see that module's header for why the two lines must
// never be normalised independently.
const CHART_W = 400;
const CHART_H = 96;
const CHART_BOX = {width: CHART_W, top: 6, bottom: 86};

const RISK_UI: Record<OvertrainingRiskLevel, {key: string; color: string}> = {
  high: {key: 'coach.overtrainingHigh', color: colors.coach.overtrainingRisk.high},
  elevated: {key: 'coach.overtrainingElevated', color: colors.coach.overtrainingRisk.elevated},
  moderate: {key: 'coach.overtrainingModerate', color: colors.coach.overtrainingRisk.moderate},
  low: {key: 'coach.overtrainingLow', color: colors.coach.overtrainingRisk.low},
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const OvertrainingTrendCard: React.FC<{activities: TrendActivity[]}> = ({activities}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  const {paths, riskRate, fatigueDetected} = useMemo(() => {
    const series = selectTrendSeries(activities);
    const risk = computeOvertrainingRate(series.hr, series.speedKmh);
    return {
      paths: buildTrendChartPaths(series, CHART_BOX),
      riskRate: risk?.rate ?? null,
      fatigueDetected: risk?.fatigueDetected ?? false,
    };
  }, [activities]);

  if (!paths) return null;

  const riskBucket = riskRate != null ? RISK_UI[getOvertrainingRiskLevel(riskRate)] : null;

  return (
    <CoachCard glow={false} wrapperStyle={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('coach.trendTitle')}</Text>
       
      </View>

      {riskRate != null && riskBucket ? <View style={styles.riskWrap}>
          <StatusPill
            color={riskBucket.color}
            tint={hexToRgba(riskBucket.color, 0.12)}
            label={`${t('coach.overtrainingRiskLabel')} ${riskRate}% · ${t(riskBucket.key)}`}
          />
        </View> : null}
      {fatigueDetected ? <Text style={styles.fatigueNote}>{t('coach.trendFatigueBadge')}</Text> : null}

      <View style={styles.chartWrapper}>
        <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.colors.coach.trendChart.hrFill} stopOpacity={0.18} />
              <Stop offset="100%" stopColor={theme.colors.coach.trendChart.hrFill} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="hrStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={theme.colors.coach.trendChart.hrStrokeStart} />
              <Stop offset="100%" stopColor={theme.colors.coach.trendChart.hrStrokeEnd} />
            </LinearGradient>
            <LinearGradient id="spStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={theme.colors.coach.trendChart.speedStrokeStart} />
              <Stop offset="100%" stopColor={theme.colors.coach.trendChart.speedStrokeEnd} />
            </LinearGradient>
          </Defs>
          <Path d={paths.hrArea} fill="url(#hrFill)" stroke="none" />
          <Path
            d={paths.speedLine}
            fill="none"
            stroke="url(#spStroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <Path
            d={paths.hrLine}
            fill="none"
            stroke="url(#hrStroke)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
      </View>
      <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, {backgroundColor: theme.colors.coach.trendChart.hrFill}]} />
            <Text style={styles.legendText}>{t('heartAnalysis.avgHRLabel')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, {backgroundColor: theme.colors.coach.trendChart.speedLegendDot}]} />
            <Text style={styles.legendText}>{t('heartAnalysis.avgSpeedLabel')}</Text>
          </View>
        </View>
     
    </CoachCard>
  );
};

const styles = makeStyles(theme => ({
  wrapper: {
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: theme.colors.text.deepInk,
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: theme.colors.coach.trendChart.legendText,
    fontWeight: '500',
  },
  riskWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  fatigueNote: {
    fontSize: 11,
    color: theme.colors.coach.trendChart.fatigueNote,
    marginTop: 4,
  },
  chartWrapper: {
    marginTop: 14,
  },
}));
