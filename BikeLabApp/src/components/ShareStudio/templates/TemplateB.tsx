/**
 * Template B - Map with Blue Info Block
 * Top: BIKELAB + RIDE WISELY logos
 * Middle: Full map
 * Bottom: Blue block with distance + title, dark block with metrics
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

// Logos
const bikelabLogo = require('../../../assets/img/shareTemplates/logos/BIKELAB.png');
const rideWLogo = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateB: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  trackCoordinates = [],
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

  // Calculate map region from coordinates
  const getMapRegion = () => {
    if (trackCoordinates.length === 0) {
      return {
        latitude: 50.4501,
        longitude: 30.5234,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };
    }

    const lats = trackCoordinates.map(c => c.latitude);
    const lngs = trackCoordinates.map(c => c.longitude);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Slightly offset center up so route appears more in the upper portion
    const latDelta = (maxLat - minLat) * 1.6;
    const lngDelta = (maxLng - minLng) * 1.6;

    return {
      latitude: centerLat - latDelta * 0.1, // Shift down so route appears higher
      longitude: centerLng,
      latitudeDelta: Math.max(latDelta, 0.02),
      longitudeDelta: Math.max(lngDelta, 0.02),
    };
  };

  return (
    <View style={styles.container}>
      {/* Map Section - Full height minus bottom blocks */}
      <View style={styles.mapSection}>
        {backgroundType === 'photo' && backgroundImage ? (
          <Image
            source={{uri: backgroundImage}}
            style={styles.mapContainer}
            resizeMode="cover"
          />
        ) : trackCoordinates.length > 0 ? (
          <MapView
            style={styles.mapContainer}
            provider={PROVIDER_DEFAULT}
            region={getMapRegion()}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            showsBuildings={false}
            showsTraffic={false}
            showsIndoors={false}
            showsPointsOfInterests={false}
            showsCompass={false}
            toolbarEnabled={false}
            userInterfaceStyle="dark"
            mapType="mutedStandard"
          >
            <Polyline
              coordinates={trackCoordinates}
              strokeWidth={8}
              strokeColor="#FFFFFF"
              lineCap="round"
              lineJoin="round"
            />
          </MapView>
        ) : (
          <View style={[styles.mapContainer, styles.mapPlaceholder]}>
            <Text style={styles.mapPlaceholderText}>No route data</Text>
          </View>
        )}

        {/* Gradient overlay on map: transparent at top → dark at bottom (80%) */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
          style={styles.gradientOverlay}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: 1}}
        />
      </View>

      {/* Top Logos - Positioned over map */}
      <View style={styles.headerLogos}>
        <Image source={bikelabLogo} style={styles.bikelabLogo} resizeMode="contain" />
        <Image source={rideWLogo} style={styles.rideWLogo} resizeMode="contain" />
      </View>

      {/* Blue Info Block */}
      <View style={styles.blueBlock}>
        <View style={styles.distanceRow}>
          <Text style={styles.distanceValue}>{distance} km</Text>
        </View>
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>
      </View>

      {/* Dark Metrics Block */}
      <View style={styles.darkBlock}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Avg. speed</Text>
          <Text style={styles.metricValue}>{avgSpeed} km/h</Text>
        </View>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Moving time</Text>
          <Text style={styles.metricValue}>{formatDuration(activity.moving_time)}</Text>
        </View>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Elevation</Text>
          <Text style={styles.metricValue}>{elevation}m</Text>
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
  // Map section
  mapSection: {
    height: TEMPLATE_HEIGHT * 0.65, // ~58% of screen
    width: TEMPLATE_WIDTH,
    position: 'relative',
  },
  mapContainer: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  mapPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 32,
    fontWeight: '600',
  },
  // Gradient overlay: 0% top → 80% bottom
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: TEMPLATE_WIDTH,
    height: '100%',
  },
  // Top logos - positioned over map
  headerLogos: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 48,
    zIndex: 10,
  },
  bikelabLogo: {
    width: 180,
    height: 80,
  },
  rideWLogo: {
    width: 140,
    height: 140,
  },
  // Blue info block
  blueBlock: {
    backgroundColor: '#274dd3',
    paddingHorizontal: 72,
    paddingVertical: 0,
    height: TEMPLATE_HEIGHT * 0.17, // ~24% of screen
    justifyContent: 'center',
  },
  distanceRow: {
    marginBottom: 16,
  },
  distanceValue: {
    fontSize: 100,
    color: '#ffffff',
    fontWeight: '900',
    lineHeight: 100,
    letterSpacing: 0,
  },
  titleText: {
    fontSize: 36,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    lineHeight: 48,
    letterSpacing: 1,
  },
  // Dark metrics block
  darkBlock: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 70,
    paddingHorizontal: 72,
    height: TEMPLATE_HEIGHT * 0.18, // ~18% of screen
  },
  metricItem: {
    alignItems: 'flex-start',
  },
  metricLabel: {
    fontSize: 32,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  metricValue: {
    fontSize: 40,
    color: '#ffffff',
    fontWeight: '700',
  },
});
