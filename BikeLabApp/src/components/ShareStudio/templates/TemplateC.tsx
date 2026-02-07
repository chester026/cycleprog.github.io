/**
 * Template C - Minimal Stats
 * Clean, minimalist template with typography focus
 * Gradient overlay: blue 20% top, black 80% bottom
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import LinearGradient from 'react-native-linear-gradient';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

const GRADIENT_TOP_HEIGHT = TEMPLATE_HEIGHT * 1;  // 20% сверху — синий
const GRADIENT_BOTTOM_HEIGHT = TEMPLATE_HEIGHT * 1; // 80% снизу — чёрный

// Branded background
const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');

// Logos
const bikelabLogo = require('../../../assets/img/shareTemplates/logos/BIKELAB.png');
const symbolLogo = require('../../../assets/img/shareTemplates/logos/symbol.png');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateC: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  isGrayscale,
}) => {
  const distance = (activity.distance / 1000).toFixed(1);
  const elevation = Math.round(activity.total_elevation_gain);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);
  
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}.${day}.${year}`;
  };

  const gradientOverlay = (
    <>
      <LinearGradient
        colors={['rgba(11, 30, 97, 0.2)', 'rgba(39, 77, 211, 0.15)']}
        style={[styles.gradientOverlay, styles.gradientTop]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
      />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.15)', 'rgba(0, 0, 0, 0.86)']}
        style={[styles.gradientOverlay, styles.gradientBottom]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
      />
    </>
  );

  const renderBackground = () => {
    if (backgroundType === 'branded2') {
      return (
        <Image
          source={brandedBg2}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      );
    }

    if (backgroundType === 'photo' && backgroundImage) {
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
          {gradientOverlay}
        </>
      );
    }

    if (backgroundType === 'transparent') {
      return <View style={styles.transparentBackground} />;
    }

    return (
      <Image
        source={brandedBg2}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderBackground()}
      
      {/* Top Right Symbol */}
      <Image source={symbolLogo} style={styles.symbolLogo} resizeMode="contain" />
      
      <View style={styles.content}>
        {/* Top Logo */}
        <Image source={bikelabLogo} style={styles.topLogo} resizeMode="contain" />
        
        {/* Date */}
        <Text style={styles.dateText}>{formatDate(activity.start_date)}</Text>
        
        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Distance Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>Distance</Text>
          <View style={styles.distanceBox}>
            <Text style={styles.distanceValue}>{distance} km</Text>
          </View>
        </View>

        {/* Speed Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>Speed, <Text style={styles.statLabelLight}>avg</Text></Text>
          <Text style={styles.statValue}>{avgSpeed}</Text>
        </View>

        {/* Elevation Section */}
        <View style={styles.statSection}>
          <Text style={styles.statLabel}>Elevation, <Text style={styles.statLabelLight}>m</Text></Text>
          <Text style={styles.statValue}>{elevation}</Text>
        </View>

        {/* Bottom Logo */}
        <View style={styles.logoSection}>
          <Image source={rideWLogo} style={styles.bottomLogo} resizeMode="contain" />
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
  transparentBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  grayscaleContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: TEMPLATE_WIDTH,
  },
  gradientTop: {
    top: 0,
    height: GRADIENT_TOP_HEIGHT,
  },
  gradientBottom: {
    bottom: 0,
    height: GRADIENT_BOTTOM_HEIGHT,
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
    paddingTop: 380,
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
    lineHeight: 110,
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
  },
  bottomLogo: {
    width: 150,
    height: 150,
    marginTop: 200,
    marginLeft: 16,
  },
});
