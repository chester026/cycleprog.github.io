/**
 * Template D - With Mini Charts
 * Template with speed, heart rate, and cadence charts
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TemplateProps} from '../types';
import {TemplateCanvas, BackgroundLayer} from './TemplateFrame';
import {MiniChart} from './MiniChart';
import {formatDistanceKm} from '../format';

const brandedBg1 = require('../../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');
const brandedBg5 = require('../../../assets/img/shareTemplates/template5.webp');
const logoBlue = require('../../../assets/img/shareTemplates/logos/logo_blue.png');
const rideWhite = require('../../../assets/img/shareTemplates/logos/ride_w.png');

const CHART_WIDTH = 450;
const CHART_SPACING_WIDTH = 480; // legacy quirk — see MiniChart's `spacingWidth` doc.

export const TemplateD: React.FC<TemplateProps> = ({activity, backgroundType, backgroundImage, streams, isGrayscale}) => {
  const {t} = useTranslation();
  const distance = formatDistanceKm(activity.distance);
  const avgSpeed = activity.average_speed * 3.6;

  const speedData = streams?.velocity_smooth?.data?.map((v: number) => v * 3.6);
  const heartRateData = streams?.heartrate?.data;
  const cadenceData = streams?.cadence?.data;

  const renderMiniChartCard = (title: string, data: number[] | undefined, color: string, unit: string, avgValue?: number) => {
    if (!data || data.length === 0) return null;
    const avg = avgValue ?? data.reduce((sum, v) => sum + v, 0) / data.length;

    return (
      <View style={styles.miniChartCard}>
        <View style={styles.miniChartHeader}>
          <Text style={styles.miniChartTitle}>{title}</Text>
          <Text style={styles.miniChartAvg}>
            {avg.toFixed(1)} {unit}
          </Text>
        </View>
        <View style={styles.miniChartContent}>
          <MiniChart data={data} color={color} width={CHART_WIDTH} spacingWidth={CHART_SPACING_WIDTH} areaChart />
        </View>
      </View>
    );
  };

  return (
    <TemplateCanvas backgroundColor="#000">
      <BackgroundLayer
        backgroundType={backgroundType}
        backgroundImage={backgroundImage}
        isGrayscale={isGrayscale}
        brandedSources={{branded1: brandedBg1, branded2: brandedBg2, branded5: brandedBg5}}
        overlay="gradient"
        gradientOverlayColors={{
          top: ['rgba(11, 30, 97, 0.05)', 'rgba(39, 48, 211, 0.1)'],
          bottom: ['rgba(0, 0, 0, 0)', 'rgba(1, 1, 8, 0.78)'],
        }}
      />

      <View style={styles.content}>
        {/* Top Logo */}
        <View style={styles.topLogo}>
          <Image source={logoBlue} style={styles.logoBlueImage} resizeMode="contain" />
        </View>

        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Big Distance */}
        <Text style={styles.distanceText}>{distance} km</Text>

        {/* Charts Section */}
        <View style={styles.chartsSection}>
          {renderMiniChartCard(t('common.speed'), speedData, '#10b981', 'km/h', avgSpeed)}

          {heartRateData && heartRateData.length > 0
            ? renderMiniChartCard(t('common.heartRate'), heartRateData, '#FF5E00', 'bpm', activity.average_heartrate)
            : renderMiniChartCard(t('common.cadence'), cadenceData, '#8B5CF6', 'rpm', activity.average_cadence)}
        </View>

        {/* Bottom Logo */}
        <View style={styles.bottomLogo}>
          <Image source={rideWhite} style={styles.rideWhiteImage} resizeMode="contain" />
        </View>
      </View>
    </TemplateCanvas>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 80,
    paddingTop: 100,
    paddingBottom: 100,
  },
  topLogo: {
    alignItems: 'center',
    marginBottom: 110,
  },
  logoBlueImage: {
    width: 280,
    height: 280,
  },
  titleText: {
    fontSize: 54,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 52,
    paddingHorizontal: 52,
  },
  distanceText: {
    fontSize: 120,
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 120,
    letterSpacing: 3,
  },
  chartsSection: {
    alignSelf: 'center',
    justifyContent: 'space-between',
    gap: 84,
  },
  miniChartCard: {
    overflow: 'hidden',
  },
  miniChartHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  miniChartTitle: {
    fontSize: 28,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  miniChartAvg: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
  },
  miniChartContent: {
    marginLeft: -24,
    marginRight: -10,
  },
  bottomLogo: {
    alignItems: 'center',
    marginTop: 120,
    position: 'absolute',
    bottom: 92,
    left: 470,
  },
  rideWhiteImage: {
    width: 150,
    height: 150,
  },
});
