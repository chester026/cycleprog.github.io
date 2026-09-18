/**
 * Template E - Brand 3 Background with options
 * Clean centered layout with template3.webp as default background
 * Supports: Brand 3 (default), Transparent, Photo from gallery
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';
import {TemplateCanvas} from './TemplateFrame';
import {formatDistanceKm, formatSpeedKmh, formatElevationM, formatDuration} from '../format';

// Default background for this template
const brand3Bg = require('../../../assets/img/shareTemplates/template3.webp');

// Logos
const bikelabLogo = require('../../../assets/img/shareTemplates/logos/BIKELAB.png');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateE: React.FC<TemplateProps> = ({activity, backgroundType, backgroundImage, isGrayscale}) => {
  const {t} = useTranslation();
  const distance = formatDistanceKm(activity.distance);
  const elevation = formatElevationM(activity.total_elevation_gain);
  const avgSpeed = formatSpeedKmh(activity.average_speed);

  // Template E always shows brand3Bg on top: as the sole background, or
  // layered over a transparent/photo base — unlike the other templates'
  // BackgroundLayer, so it keeps its own render logic.
  const renderBackground = () => {
    if (backgroundType === 'transparent') {
      return (
        <>
          <View style={styles.transparentBackground} />
          <Image source={brand3Bg} style={styles.backgroundImage} resizeMode="cover" />
        </>
      );
    }

    if (backgroundType === 'photo' && backgroundImage) {
      const photoImage = <Image source={{uri: backgroundImage}} style={styles.backgroundImage} resizeMode="cover" />;
      return (
        <>
          {isGrayscale ? <Grayscale style={styles.grayscaleContainer}>{photoImage}</Grayscale> : photoImage}
          <Image source={brand3Bg} style={styles.backgroundImage} resizeMode="cover" />
        </>
      );
    }

    return <Image source={brand3Bg} style={styles.backgroundImage} resizeMode="cover" />;
  };

  return (
    <TemplateCanvas>
      {renderBackground()}

      {/* Top Right Logo */}
      <Image source={rideWLogo} style={styles.topRightLogo} resizeMode="contain" />

      {/* Bottom Left Logo */}
      <Image source={bikelabLogo} style={styles.bottomLeftLogo} resizeMode="contain" />

      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Big Distance */}
        <Text style={styles.distanceValue}>{distance} km</Text>

        {/* Stats */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('common.avgSpeed')}</Text>
            <Text style={styles.statValue}>{avgSpeed} km/h</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('common.elevation')}</Text>
            <Text style={styles.statValue}>{elevation} m</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('common.time')}</Text>
            <Text style={styles.statValue}>{formatDuration(activity.moving_time)}</Text>
          </View>
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
  grayscaleContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  transparentBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  topRightLogo: {
    position: 'absolute',
    top: 5,
    right: 50,
    width: 160,
    height: 160,
  },
  bottomLeftLogo: {
    position: 'absolute',
    bottom: 70,
    left: 100,
    width: 200,
    height: 50,
  },
  content: {
    flex: 1,
    paddingHorizontal: 100,
    paddingTop: 370,
    paddingBottom: 180,
    alignItems: 'center',
  },
  titleText: {
    fontSize: 58,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 90,
  },
  distanceValue: {
    fontSize: 150,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 130,
  },
  statsSection: {
    alignItems: 'center',
    gap: 92,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 45,
    color: 'rgba(255, 255, 255, 1)',
    fontWeight: '500',
    marginBottom: 24,
  },
  statValue: {
    fontSize: 92,
    color: '#ffffff',
    fontWeight: '800',
  },
});
