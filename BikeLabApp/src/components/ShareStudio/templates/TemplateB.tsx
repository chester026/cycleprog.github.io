/**
 * Template B - Full-bleed Map / Photo with bottom stats overlay
 * Background: map or user photo fills 100%
 * Bottom gradient fades up, stats sit on top
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import LinearGradient from 'react-native-linear-gradient';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';
import {TemplateCanvas, StatBlock, StatRow} from './TemplateFrame';
import {RouteMap} from './RouteMap';
import {formatDistanceKm, formatSpeedKmh, formatElevationM, formatDurationPadded} from '../format';

const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');
const symbolLogo = require('../../../assets/img/shareTemplates/logos/symbol.png');

export const TemplateB: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  trackCoordinates = [],
  mapStyle = 'dark',
  isGrayscale,
}) => {
  const {t} = useTranslation();
  const distance = formatDistanceKm(activity.distance);
  const elevation = formatElevationM(activity.total_elevation_gain);
  const avgSpeed = formatSpeedKmh(activity.average_speed);

  const renderBackground = () => {
    if (backgroundType === 'photo' && backgroundImage) {
      const photoImage = <Image source={{uri: backgroundImage}} style={styles.fullBackground} resizeMode="cover" />;
      return isGrayscale ? <Grayscale style={styles.fullBackground}>{photoImage}</Grayscale> : photoImage;
    }
    return <RouteMap trackCoordinates={trackCoordinates} mapStyle={mapStyle} />;
  };

  return (
    <TemplateCanvas backgroundColor="#000">
      {renderBackground()}

      {/* Gradient: transparent top -> dark bottom */}
      <LinearGradient
        colors={[
          'transparent',
          'transparent',
          'rgba(0,0,0,0.1)',
          'rgba(0,0,0,0.30)',
          'rgba(0,0,0,0.55)',
          'rgba(0,0,0,0.75)',
        ]}
        locations={[0, 0.3, 0.45, 0.6, 0.78, 1]}
        style={styles.gradient}
      />

      {/* Bottom overlay: logos + name + stats */}
      <View style={styles.bottom}>
        <View style={styles.logosRow}>
          <Image source={symbolLogo} style={styles.symbolLogo} resizeMode="contain" />
          <Image source={rideWLogo} style={styles.rideWLogo} resizeMode="contain" />
        </View>

        <Text style={styles.activityName} numberOfLines={2}>
          {activity.name}
        </Text>

        <View style={styles.statsGrid}>
          <StatRow style={styles.statsRow}>
            <StatBlock
              style={styles.statItem}
              label={t('common.distance')}
              labelStyle={styles.statLabel}
              value={`${distance} km`}
              valueStyle={styles.statValue}
              shrinkToFit
            />
            <StatBlock
              style={styles.statItem}
              label={t('common.speed')}
              labelStyle={styles.statLabel}
              value={`${avgSpeed} km/h`}
              valueStyle={styles.statValue}
              shrinkToFit
            />
          </StatRow>
          <StatRow style={styles.statsRow}>
            <StatBlock
              style={styles.statItem}
              label={t('common.elevation')}
              labelStyle={styles.statLabel}
              value={`${elevation} m`}
              valueStyle={styles.statValue}
              shrinkToFit
            />
            <StatBlock
              style={styles.statItem}
              label={t('common.time')}
              labelStyle={styles.statLabel}
              value={formatDurationPadded(activity.moving_time)}
              valueStyle={styles.statValue}
              shrinkToFit
            />
          </StatRow>
        </View>
        <Text style={styles.bikelabText} numberOfLines={2}>
          {t('shareStudio.bikelab')}
        </Text>
      </View>
    </TemplateCanvas>
  );
};

const styles = StyleSheet.create({
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 64,
    paddingBottom: 140,
  },
  logosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 64,
  },
  rideWLogo: {
    width: 140,
    height: 140,
    position: 'relative',
    top: -8,
    left: 0,
  },
  symbolLogo: {
    width: 180,
    height: 180,
    position: 'relative',
    left: -60,
  },
  activityName: {
    fontSize: 58,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 64,
    letterSpacing: 0.5,
  },
  statsGrid: {
    gap: 36,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  statItem: {
    flex: 0,
    marginRight: 72,
    minWidth: 450,
  },
  statValue: {
    fontSize: 72,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0,
    marginBottom: 24,
  },
  statLabel: {
    fontSize: 28,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  bikelabText: {
    fontSize: 26,
    fontWeight: '800',
    color: 'rgba(255,255,255,1)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
    position: 'absolute',
    bottom: 32,
    right: 64,
    display: 'none',
  },
});
