/**
 * Template B - Full Map Background
 * Map covers entire background with gradient overlay (100% top → 0% bottom)
 * Stats at the bottom
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

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

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
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
      {/* Full-screen Map Background */}
      <View style={styles.mapBackground}>
        {backgroundType === 'photo' && backgroundImage ? (
          <Image
            source={{uri: backgroundImage}}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : trackCoordinates.length > 0 ? (
          <MapView
            style={styles.map}
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
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>No route data</Text>
          </View>
        )}
      </View>

      {/* Gradient Overlay: 0% at top → 100% dark at bottom */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0)',      // 0% at top
          'rgba(0, 0, 0, 0.1)',
          'rgba(0, 0, 0, 0.3)',
          'rgba(0, 0, 0, 0.6)',
          'rgba(0, 0, 0, 0.85)',
          'rgba(0, 0, 0, 1)',      // 100% at bottom
        ]}
        locations={[0, 0.25, 0.45, 0.65, 0.85, 1]}
        style={styles.gradientOverlay}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Header - Top */}
        <View style={styles.header}>
          <Text style={styles.brandText}>BIKELAB</Text>
          <Text style={styles.dateText}>{formatDate(activity.start_date)}</Text>
        </View>

        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Spacer - push stats to bottom */}
        <View style={styles.spacer} />

        {/* Bottom Stats */}
        <View style={styles.bottomSection}>
          {/* Main Distance */}
          <View style={styles.distanceRow}>
            <Text style={styles.distanceValue}>{distance}</Text>
            <Text style={styles.distanceUnit}>km</Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{elevation}</Text>
              <Text style={styles.statLabel}>m ↑</Text>
            </View>
            
            <View style={styles.statDivider} />
            
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(activity.moving_time)}</Text>
              <Text style={styles.statLabel}>time</Text>
            </View>
            
            <View style={styles.statDivider} />
            
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{avgSpeed}</Text>
              <Text style={styles.statLabel}>km/h</Text>
            </View>

            {activity.average_heartrate && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, {color: '#ff4757'}]}>
                    {Math.round(activity.average_heartrate)}
                  </Text>
                  <Text style={styles.statLabel}>bpm</Text>
                </View>
              </>
            )}
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
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  mapPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 32,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    padding: 64,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 48,
  },
  brandText: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '800',
    letterSpacing: 4,
  },
  dateText: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  titleText: {
    fontSize: 52,
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: 64,
    marginTop: 24,
  },
  spacer: {
    flex: 1,
  },
  bottomSection: {
    marginBottom: 48,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 32,
    gap: 16,
  },
  distanceValue: {
    fontSize: 160,
    color: '#ffffff',
    fontWeight: '900',
    lineHeight: 160,
    letterSpacing: -6,
  },
  distanceUnit: {
    fontSize: 56,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 40,
    color: '#ffffff',
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  statDivider: {
    width: 2,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
