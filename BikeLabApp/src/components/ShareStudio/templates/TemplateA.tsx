/**
 * Template A - Big Distance + Elevation
 * Hero-style template with large distance number and elevation stats
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TemplateProps} from '../types';
import {TemplateCanvas, BackgroundLayer} from './TemplateFrame';
import {formatDistanceKm, formatSpeedKmh, formatElevationM, formatDurationWithSeconds, formatDateLong} from '../format';
import {makeStyles} from '../../../theme';

const brandedBg1 = require('../../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');
const symbolLogo = require('../../../assets/img/shareTemplates/logos/symbol.png');

export const TemplateA: React.FC<TemplateProps> = ({activity, backgroundType, backgroundImage, isGrayscale}) => {
  const {t} = useTranslation();
  const distance = formatDistanceKm(activity.distance);
  const elevation = formatElevationM(activity.total_elevation_gain);
  const avgSpeed = formatSpeedKmh(activity.average_speed);
  const maxSpeed = formatSpeedKmh(activity.max_speed);

  return (
    <TemplateCanvas style={styles.canvasPadding}>
      <BackgroundLayer
        backgroundType={backgroundType}
        backgroundImage={backgroundImage}
        isGrayscale={isGrayscale}
        brandedSources={{branded1: brandedBg1, branded2: brandedBg2}}
        overlay="dim"
      />

      {/* Top Right Symbol */}
      <Image source={symbolLogo} style={styles.symbolLogo} resizeMode="contain" />

      <View style={styles.content}>
        <Text style={styles.brandText}>{t('shareStudio.bikelab')}</Text>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.dateText}>{formatDateLong(activity.start_date)}</Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {activity.name}
          </Text>
        </View>

        {/* Main Stats - Big Distance */}
        <View style={styles.mainStats}>
          <Text style={styles.distanceUnit}>{t('common.distance')}</Text>
          <Text style={styles.distanceValue}>{distance} km</Text>
        </View>

        {/* Secondary Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('garage.elevationM')}</Text>
            <Text style={styles.statValue}>{elevation}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('shareStudio.movingTime')}</Text>
            <Text style={styles.statValue}>{formatDurationWithSeconds(activity.moving_time)}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{t('garage.avgSpeedKmh')}</Text>
            <Text style={styles.statValue}>{avgSpeed}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>
              {t('common.maxSpeed')}, {t('common.kmh')}
            </Text>
            <Text style={styles.statValue}>{maxSpeed}</Text>
          </View>
        </View>

        {/* Bottom Logo */}
        <View style={styles.bottomLogoSection}>
          <Image source={rideWLogo} style={styles.bottomLogo} resizeMode="contain" />
        </View>
      </View>
    </TemplateCanvas>
  );
};

const styles = makeStyles(theme => ({
  canvasPadding: {
    padding: 170,
    paddingTop: 210,
  },
  symbolLogo: {
    position: 'absolute',
    top: 23,
    right: 50,
    width: 180,
    height: 180,
  },
  content: {
    flex: 1,
    padding: 0,
    justifyContent: 'flex-start',
    gap: 64,
  },
  header: {
    marginTop: 40,
  },
  dateText: {
    fontSize: 32,
    color: theme.colors.share.mutedWhite60,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 24,
  },
  titleText: {
    fontSize: 72,
    color: theme.colors.text.inverse,
    fontWeight: '800',
    lineHeight: 90,
  },
  mainStats: {
    alignItems: 'flex-start',
    marginVertical: 50,
  },
  distanceValue: {
    fontSize: 140,
    fontWeight: '900',
    color: theme.colors.text.inverse,
    lineHeight: 165,
    letterSpacing: 0,
    paddingHorizontal: 32,
    backgroundColor: theme.colors.accent,
  },
  distanceUnit: {
    fontSize: 40,
    color: theme.colors.text.inverse,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  statBox: {
    width: '48%',
    paddingVertical: 32,
    paddingHorizontal: 0,
    borderRadius: 0,
  },
  statLabel: {
    fontSize: 32,
    color: theme.colors.text.inverse,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 16,
  },
  statValue: {
    fontSize: 90,
    color: theme.colors.text.inverse,
    fontWeight: '800',
  },
  brandText: {
    fontSize: 50,
    color: theme.colors.text.inverse,
    fontWeight: '900',
    letterSpacing: 3,
  },
  bottomLogoSection: {
    marginTop: 'auto',
    alignItems: 'flex-start',
    position: 'absolute',
    bottom: -80,
    left: 0,
  },
  bottomLogo: {
    width: 140,
    height: 140,
    marginLeft: 12,
  },
}));
