/**
 * Template A - Big Distance + Elevation
 * Hero-style template with large distance number and elevation stats
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, GRADIENTS} from '../types';

// Branded backgrounds
const brandedBg1 = require('../../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');

// Logos
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');
const symbolLogo = require('../../../assets/img/shareTemplates/logos/symbol.png');

export const TemplateA: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  isGrayscale,
}) => {
  const distance = (activity.distance / 1000).toFixed(1);
  const elevation = Math.round(activity.total_elevation_gain);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);
  const maxSpeed = (activity.max_speed * 3.6).toFixed(1);
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getBrandedBg = () => {
    switch (backgroundType) {
      case 'branded1': return brandedBg1;
      case 'branded2': return brandedBg2;
      default: return brandedBg1;
    }
  };

  const renderBackground = () => {
    if (backgroundType === 'branded1' || backgroundType === 'branded2') {
      return (
        <Image
          source={getBrandedBg()}
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
          <View style={styles.imageOverlay} />
        </>
      );
    }

    if (backgroundType === 'transparent') {
      return <View style={styles.transparentBackground} />;
    }

    // Default gradient
    return (
      <LinearGradient
        colors={GRADIENTS.dark}
        style={styles.gradientBackground}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderBackground()}
      
      {/* Top Right Symbol */}
      <Image source={symbolLogo} style={styles.symbolLogo} resizeMode="contain" />
      
      <View style={styles.content}>
         
        
          <Text style={styles.brandText}>BIKELAB</Text>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.dateText}>{formatDate(activity.start_date)}</Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {activity.name}
          </Text>
        </View>

        {/* Main Stats - Big Distance */}
        <View style={styles.mainStats}>
        <Text style={styles.distanceUnit}>Distance</Text>
          <Text style={styles.distanceValue}>{distance} km</Text>
          
        </View>

        {/* Secondary Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Elevation, m</Text>
            <Text style={styles.statValue}>{elevation}</Text>
           
          </View>
          
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Time, moving</Text>
            <Text style={styles.statValue}>{formatDuration(activity.moving_time)}</Text>
           
          </View>
          
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Avg. speed, km/h</Text>
            <Text style={styles.statValue}>{avgSpeed}</Text>
           
          </View>
          
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Max. speed, km/h</Text>
            <Text style={styles.statValue}>{maxSpeed}</Text>
           
          </View>
        </View>

        {/* Heart Rate if available */}
       {/*{activity.average_heartrate && (
          <View style={styles.heartRateSection}>
            <Text style={styles.heartIcon}>♥</Text>
            <Text style={styles.heartValue}>{Math.round(activity.average_heartrate)}</Text>
            <Text style={styles.heartUnit}>avg bpm</Text>
          </View>
        )}*/}

        {/* Bottom Logo */}
        <View style={styles.bottomLogoSection}>
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
    padding: 170,
    paddingTop: 230,
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
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
  symbolLogo: {
    position: 'absolute',
    top: 23,
    right: 50,
    width: 180,
    height: 180,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 24,
  },
  titleText: {
    fontSize: 72,
    color: '#ffffff',
    fontWeight: '800',
    lineHeight: 68,
  },
  mainStats: {
    alignItems: 'flex-start',
    marginVertical: 50,
  },
  distanceValue: {
    fontSize: 140,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 165,
    letterSpacing: 0,
    paddingHorizontal: 32,
    backgroundColor: '#274dd3',
  },
  distanceUnit: {
    fontSize: 40,
    color: '#fff',
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
    fontSize:32,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 16,
  },
  statValue: {
    fontSize: 90,
    color: '#ffffff',
    fontWeight: '800',
  },
  statUnit: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    marginTop: 4,
  },
  heartRateSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 0,
    gap: 16,
  },
  heartIcon: {
    fontSize: 48,
    color: '#ff4757',
  },
  heartValue: {
    fontSize: 52,
    color: '#ffffff',
    fontWeight: '800',
  },
  heartUnit: {
    fontSize: 32,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  brandText: {
    fontSize: 50,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 3,
  },
  bottomLogoSection: {
    marginTop: 'auto',
    alignItems: 'flex-start',
  },
  bottomLogo: {
    width: 140,
    height: 140,
    marginTop: 140,
    marginLeft: 12,
  },
});
