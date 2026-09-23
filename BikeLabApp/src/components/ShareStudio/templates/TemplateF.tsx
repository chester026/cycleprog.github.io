/**
 * Template F - Journal
 * Journal-style template with charts
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';
import {TemplateCanvas} from './TemplateFrame';
import {MiniChart} from './MiniChart';
import {formatDistanceKmComma, formatElevationM, formatDuration} from '../format';
import {makeStyles, useTheme} from '../../../theme';

// Journal background
const journalBg = require('../../../assets/img/shareTemplates/template4.webp');
const logoVertical = require('../../../assets/img/shareTemplates/logos/logo_vertical.png');

const CHART_WIDTH = TEMPLATE_WIDTH - 450;

export const TemplateF: React.FC<TemplateProps> = ({activity, streams}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const distanceFormatted = formatDistanceKmComma(activity.distance);
  const elevation = formatElevationM(activity.total_elevation_gain);
  const avgSpeed = activity.average_speed * 3.6;

  const speedData = streams?.velocity_smooth?.data?.map((v: number) => v * 3.6);
  const heartRateData = streams?.heartrate?.data;
  const cadenceData = streams?.cadence?.data;

  const renderMiniChartSection = (title: string, data: number[] | undefined, color: string, unit: string, avgValue?: number) => {
    if (!data || data.length === 0) return null;
    const avg = avgValue ?? data.reduce((sum, v) => sum + v, 0) / data.length;

    return (
      <View style={styles.chartSection}>
        <Text style={styles.chartLabel}>{title}</Text>
        <Text style={styles.chartValue}>
          {avg.toFixed(1)} {unit}
        </Text>
        <View style={styles.chartContainer}>
          <MiniChart data={data} color={color} width={CHART_WIDTH} thickness={3} />
        </View>
      </View>
    );
  };

  const speedChart = renderMiniChartSection(t('common.speed'), speedData, theme.colors.chart.series2, 'km/h', avgSpeed);
  const secondaryChart =
    heartRateData && heartRateData.length > 0
      ? renderMiniChartSection(t('common.heartRate'), heartRateData, theme.colors.chart.series3, 'bpm', activity.average_heartrate)
      : cadenceData && cadenceData.length > 0
        ? renderMiniChartSection(t('common.cadence'), cadenceData, theme.colors.chart.series2, 'rpm', activity.average_cadence)
        : renderMiniChartSection(t('common.speed'), speedData, theme.colors.chart.series2, 'km/h', avgSpeed);

  return (
    <TemplateCanvas>
      <Image source={journalBg} style={styles.backgroundImage} resizeMode="cover" />

      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Big Distance */}
        <View style={styles.distanceSection}>
          <Text style={styles.distanceValue}>{distanceFormatted}</Text>
          <Text style={styles.distanceUnit}>{t('common.km')}</Text>
        </View>

        {/* Charts Section */}
        <View style={styles.chartsWrapper}>
          {speedChart}
          {secondaryChart}
        </View>

        {/* Bottom Stats Row */}
        <View style={styles.bottomStats}>
          <View style={styles.bottomStat}>
            <Text style={styles.bottomStatIcon}>⛰</Text>
            <Text style={styles.bottomStatValue}>{elevation} m</Text>
          </View>

          <View style={styles.bottomStat}>
            <Text style={styles.bottomStatIcon}>⏱</Text>
            <Text style={styles.bottomStatValue}>{formatDuration(activity.moving_time)}</Text>
          </View>
        </View>

        {/* Bottom Logo */}
        <View style={styles.logoSection}>
          <Image source={logoVertical} style={styles.logoImage} resizeMode="contain" />
        </View>
      </View>
    </TemplateCanvas>
  );
};

const styles = makeStyles(theme => ({
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  content: {
    flex: 1,
    paddingHorizontal: 150,
    paddingTop: 150,
    paddingBottom: 80,
  },
  titleText: {
    fontSize: 52,
    color: theme.colors.share.templateF.mutedTitle,
    fontWeight: '700',
    lineHeight: 76,
    marginBottom: 12,
  },
  distanceSection: {
    marginBottom: 80,
  },
  distanceValue: {
    fontSize: 180,
    fontWeight: '900',
    color: theme.colors.text.inverse,
    lineHeight: 200,
    letterSpacing: -4,
  },
  distanceUnit: {
    fontSize: 100,
    color: theme.colors.text.inverse,
    fontWeight: '800',
    marginTop: -20,
    marginBottom: 24,
  },
  chartsWrapper: {
    gap: 52,
    marginBottom: 80,
  },
  chartSection: {
    marginBottom: 24,
  },
  chartLabel: {
    fontSize: 32,
    color: theme.colors.share.mutedWhite50,
    fontWeight: '700',
    marginBottom: 8,
  },
  chartValue: {
    fontSize: 48,
    color: theme.colors.text.inverse,
    fontWeight: '600',
    marginBottom: 64,
  },
  chartContainer: {
    marginLeft: -20,
  },
  bottomStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 120,
    position: 'relative',
    top: -80,
  },
  bottomStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomStatIcon: {
    fontSize: 40,
    color: theme.colors.share.mutedWhite60,
  },
  bottomStatValue: {
    fontSize: 48,
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
  logoSection: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 'auto',
    width: '100%',
  },
  logoImage: {
    width: 220,
    height: 220,
    marginLeft: -120,
  },
}));
