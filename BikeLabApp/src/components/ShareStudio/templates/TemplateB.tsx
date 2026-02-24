/**
 * Template B - Full-bleed Map / Photo with bottom stats overlay
 * Background: map or user photo fills 100%
 * Bottom gradient fades up, stats sit on top
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

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
  const isDarkMap = mapStyle === 'dark';
  const distance = (activity.distance / 1000).toFixed(1);
  const elevation = Math.round(activity.total_elevation_gain);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h${minutes.toString().padStart(2, '0')}`;
    }
    return `${minutes}m`;
  };

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
    const latDelta = (maxLat - minLat) * 1.5;
    const lngDelta = (maxLng - minLng) * 1.5;

    return {
      latitude: centerLat - latDelta * 0.15,
      longitude: centerLng,
      latitudeDelta: Math.max(latDelta, 0.02),
      longitudeDelta: Math.max(lngDelta, 0.02),
    };
  };

  const renderBackground = () => {
    if (backgroundType === 'photo' && backgroundImage) {
      const photoImage = (
        <Image
          source={{uri: backgroundImage}}
          style={styles.fullBackground}
          resizeMode="cover"
        />
      );
      return isGrayscale ? (
        <Grayscale style={styles.grayscaleContainer}>{photoImage}</Grayscale>
      ) : (
        photoImage
      );
    }

    if (trackCoordinates.length > 0) {
      return (
        <MapView
          style={styles.fullBackground}
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
          userInterfaceStyle={isDarkMap ? 'dark' : 'light'}
          mapType="mutedStandard">
          <Polyline
            coordinates={trackCoordinates}
            strokeWidth={8}
            strokeColor={isDarkMap ? '#FFFFFF' : '#274dd3'}
            lineCap="round"
            lineJoin="round"
          />
        </MapView>
      );
    }

    return (
      <View style={[styles.fullBackground, styles.placeholder]}>
        <Text style={styles.placeholderText}>No route data</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderBackground()}

      {/* Gradient: transparent top → dark bottom */}
      <LinearGradient
        colors={[
          'transparent',
          'transparent',
          'rgba(0,0,0,0.05)',
          'rgba(0,0,0,0.35)',
          'rgba(0,0,0,0.55)',
          'rgba(0,0,0,0.75)',
        ]}
        locations={[0, 0.3, 0.45, 0.6, 0.78, 1]}
        style={styles.gradient}
      />

      {/* Bottom overlay: logos + name + stats */}
      <View style={styles.bottom}>
        <View style={styles.logosRow}>
       
         
        <Image
            source={symbolLogo}
            style={styles.symbolLogo}
            resizeMode="contain"
          />
           <Image
            source={rideWLogo}
            style={styles.rideWLogo}
            resizeMode="contain"
          />
         
        </View>

        <Text style={styles.activityName} numberOfLines={2}>
          {activity.name}
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>distance</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {distance} km
              </Text>
             
            </View>
           
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>speed</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {avgSpeed} km/h
              </Text>
             
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>elevation</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {elevation} m
              </Text>
             
            </View>
            <View style={styles.statItem}>
            <Text style={styles.statLabel}>time</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatDuration(activity.moving_time)}
              </Text>
              
            </View>
          </View>
        </View>
        <Text style={styles.bikelabText} numberOfLines={2}>
          BIKELAB
        </Text>
       
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    backgroundColor: '#000',
  },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  grayscaleContainer: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 32,
    fontWeight: '600',
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
