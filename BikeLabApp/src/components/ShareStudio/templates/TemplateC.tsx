/**
 * Template C - Minimal Stats
 * Clean, minimalist template with typography focus
 * Gradient overlay: blue 20% top, black 80% bottom
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';
import {TemplateCanvas, BackgroundLayer} from './TemplateFrame';
import {formatDistanceKm, formatSpeedKmh, formatElevationM, formatDateShort} from '../format';

const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');
const bikelabLogo = require('../../../assets/img/shareTemplates/logos/BIKELAB.png');
const symbolLogo = require('../../../assets/img/shareTemplates/logos/symbol.png');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateC: React.FC<TemplateProps> = ({activity, backgroundType, backgroundImage, isGrayscale}) => {
  const {t} = useTranslation();
  const distance = formatDistanceKm(activity.distance);
  const elevation = formatElevationM(activity.total_elevation_gain);
  const avgSpeed = formatSpeedKmh(activity.average_speed);

  return (
    <TemplateCanvas>
      <BackgroundLayer
        backgroundType={backgroundType}
        backgroundImage={backgroundImage}
        isGrayscale={isGrayscale}
        // branded2 is both the explicit option and the fallback for gradient/unset types.
        brandedSources={{branded2: brandedBg2}}
        overlay="gradient"
        gradientOverlayColors={{
          top: ['rgba(11, 30, 97, 0.2)', 'rgba(39, 77, 211, 0.15)'],
          bottom: ['rgba(0, 0, 0, 0.15)', 'rgba(0, 0, 0, 0.86)'],
        }}
        fallback={<Image source={brandedBg2} style={styles.backgroundImage} resizeMode="cover" />}
      />

      {/* Top Right Symbol */}
      <Image source={symbolLogo} style={styles.symbolLogo} resizeMode="contain" />

      <View style={styles.content}>
        {/* Top Logo */}
        <Image source={bikelabLogo} style={styles.topLogo} resizeMode="contain" />

        {/* Date */}
        <Text style={styles.dateText}>{formatDateShort(activity.start_date)}</Text>

        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Distance Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>{t('common.distance')}</Text>
          <View style={styles.distanceBox}>
            <Text style={styles.distanceValue}>{distance} km</Text>
          </View>
        </View>

        {/* Speed Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>
            {t('common.speed')}, <Text style={styles.statLabelLight}>avg</Text>
          </Text>
          <Text style={styles.statValue}>{avgSpeed}</Text>
        </View>

        {/* Elevation Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>
            {t('common.elevation')}, <Text style={styles.statLabelLight}>m</Text>
          </Text>
          <Text style={styles.statValue}>{elevation}</Text>
        </View>

        {/* Bottom Logo */}
        <View style={styles.logoSection}>
          <Image source={rideWLogo} style={styles.bottomLogo} resizeMode="contain" />
        </View>
      </View>
    </TemplateCanvas>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  symbolLogo: {
    position: 'absolute',
    top: -10,
    right: -30,
    width: 220,
    height: 220,
  },
  content: {
    flex: 1,
    paddingHorizontal: 100,
    paddingTop: 360,
    paddingBottom: 120,
  },
  topLogo: {
    width: 200,
    height: 100,
    marginBottom: 40,
    position: 'absolute',
    top: 50,
    left: 105,
  },
  dateText: {
    fontSize: 36,
    color: '#fff',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    marginBottom: 16,
  },
  titleText: {
    fontSize: 72,
    color: '#fff',
    fontWeight: '700',
    lineHeight: 92,
    marginBottom: 100,
  },
  statSection: {
    marginBottom: 64,
  },
  statLabel: {
    fontSize: 45,
    color: '#ffffff',
    fontWeight: '500',
    marginBottom: 24,
  },
  statLabelLight: {
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  distanceBox: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  distanceValue: {
    fontSize: 120,
    fontWeight: '900',
    color: '#274dd3',
    lineHeight: 140,
  },
  statValue: {
    fontSize: 120,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 140,
  },
  logoSection: {
    marginTop: 'auto',
    alignItems: 'flex-start',
    position: 'absolute',
    bottom: 32,
    left: 105,
  },
  bottomLogo: {
    width: 150,
    height: 150,
    marginLeft: 16,
  },
});
