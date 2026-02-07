/**
 * Template E - Brand 3 Background with options
 * Clean centered layout with template3.webp as default background
 * Supports: Brand 3 (default), Transparent, Photo from gallery
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

// Default background for this template
const brand3Bg = require('../../../assets/img/shareTemplates/template3.webp');

// Logos
const bikelabLogo = require('../../../assets/img/shareTemplates/logos/BIKELAB.png');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateE: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  isGrayscale,
}) => {
  const distance = (activity.distance / 1000).toFixed(1);
  const elevation = Math.round(activity.total_elevation_gain);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const renderBackground = () => {
    if (backgroundType === 'transparent') {
      // Transparent with brand overlay on top
      return (
        <>
          <View style={styles.transparentBackground} />
          <Image
            source={brand3Bg}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </>
      );
    }

    if (backgroundType === 'photo' && backgroundImage) {
      // Photo from gallery with brand overlay on top
      const photoImage = (
        <Image
          source={{uri: backgroundImage}}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      );
      
      return (
        <>
          {isGrayscale ? (
            <Grayscale style={styles.grayscaleContainer}>
              {photoImage}
            </Grayscale>
          ) : (
            photoImage
          )}
          <Image
            source={brand3Bg}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </>
      );
    }

    // Default: Just brand 3 background
    return (
      <Image
        source={brand3Bg}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
    );
  };

  return (
    <View style={styles.container}>
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
          {/* Avg Speed */}
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Avg. speed</Text>
            <Text style={styles.statValue}>{avgSpeed} km/h</Text>
          </View>

          {/* Elevation */}
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Elevation</Text>
            <Text style={styles.statValue}>{elevation} m</Text>
          </View>

          {/* Time */}
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Time</Text>
            <Text style={styles.statValue}>{formatDuration(activity.moving_time)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    backgroundColor: '#0a0a0a',
  },
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
