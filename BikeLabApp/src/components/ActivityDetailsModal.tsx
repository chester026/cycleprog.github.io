import React, {useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Linking,
  Dimensions,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {getDateLocale} from '../i18n/dateLocale';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import polyline from '@mapbox/polyline';
import type {Activity} from '../types/activity';

const {width: screenWidth} = Dimensions.get('window');
const MAP_HEIGHT = 220;

interface ActivityDetailsModalProps {
  activity: Activity | null;
  visible: boolean;
  onClose: () => void;
  onAnalyzeRide?: (activity: Activity) => void;
}

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({
  activity,
  visible,
  onClose,
  onAnalyzeRide,
}) => {
  const {t} = useTranslation();
  const mapRef = useRef<MapView>(null);

  const trackCoordinates = useMemo(() => {
    if (!activity?.map?.summary_polyline) return [];
    try {
      const points = polyline.decode(activity.map.summary_polyline);
      return points.map(([lat, lng]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      }));
    } catch {
      return [];
    }
  }, [activity?.map?.summary_polyline]);

  const mapRegion = useMemo(() => {
    if (trackCoordinates.length === 0) return null;
    const lats = trackCoordinates.map((c: any) => c.latitude);
    const lngs = trackCoordinates.map((c: any) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.005),
      longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.005),
    };
  }, [trackCoordinates]);

  const handleMapReady = useCallback(() => {
    if (mapRef.current && trackCoordinates.length > 0) {
      mapRef.current.fitToCoordinates(trackCoordinates, {
        edgePadding: {top: 40, right: 40, bottom: 40, left: 40},
        animated: false,
      });
    }
  }, [trackCoordinates]);

  if (!activity) return null;

  const formatDistance = (meters: number): string => {
    return (meters / 1000).toFixed(2) + ' km';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSpeed = (metersPerSecond: number): string => {
    return (metersPerSecond * 3.6).toFixed(1) + ' km/h';
  };

  const formatMinutes = (seconds: number): string => {
    return Math.round(seconds / 60) + ' min';
  };

  const calculateEstimatedPower = (): number | null => {
    if (activity.average_watts) return null;
    const speedKmh = activity.average_speed * 3.6;
    const elevPerKm = (activity.total_elevation_gain / (activity.distance / 1000));
    const basePower = speedKmh * (5 + elevPerKm * 0.5);
    return Math.round(basePower);
  };

  const openInStrava = () => {
    Linking.openURL(`https://www.strava.com/activities/${activity.id}`);
  };

  const handleAnalyze = () => {
    onClose();
    setTimeout(() => onAnalyzeRide?.(activity), 300);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Map */}
        {trackCoordinates.length > 0 && mapRegion ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={mapRegion}
            onMapReady={handleMapReady}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            showsBuildings={false}
            showsTraffic={false}
            showsIndoors={false}
            showsPointsOfInterests={false}
            showsUserLocation={false}
            mapType="mutedStandard">
            <Polyline
              coordinates={trackCoordinates}
              strokeWidth={3}
              strokeColor="#FFFFFF"
              lineCap="round"
              lineJoin="round"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>{t('activityDetails.noMap')}</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title} numberOfLines={1}>{activity.name}</Text>
            <Text style={styles.date}>{formatDate(activity.start_date)}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Primary stats */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>{(activity.distance / 1000).toFixed(1)}</Text>
              <Text style={styles.heroUnit}>{t('common.km')}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>{formatMinutes(activity.moving_time)}</Text>
              <Text style={styles.heroUnit}>{t('activityDetails.movTime')}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>{formatSpeed(activity.average_speed)}</Text>
              <Text style={styles.heroUnit}>{t('activityDetails.avgSpeed')}</Text>
            </View>
          </View>

          {/* Secondary stats — flat rows */}
          <View style={styles.secondaryBlock}>
            <StatRow label={t('activityDetails.elapTime')} value={formatMinutes(activity.elapsed_time)} />
            <StatRow label={t('activityDetails.maxSpeed')} value={formatSpeed(activity.max_speed)} />
            <StatRow label={t('activityDetails.elevGain')} value={`${activity.total_elevation_gain}m`} />
            {activity.elev_high !== undefined && (
              <StatRow label={t('activityDetails.maxElevation')} value={`${activity.elev_high}m`} />
            )}
            {activity.average_heartrate !== undefined && (
              <StatRow label={t('activityDetails.avgHeartrate')} value={`${Math.round(activity.average_heartrate)} bpm`} />
            )}
            {activity.max_heartrate !== undefined && (
              <StatRow label={t('activityDetails.maxHeartrate')} value={`${Math.round(activity.max_heartrate)} bpm`} />
            )}
            {activity.average_cadence !== undefined && (
              <StatRow label={t('activityDetails.avgCadence')} value={`${Math.round(activity.average_cadence)} rpm`} />
            )}
            {activity.average_temp !== undefined && (
              <StatRow label={t('activityDetails.temp')} value={`${activity.average_temp}°C`} />
            )}
            {calculateEstimatedPower() !== null && (
              <StatRow label={t('activityDetails.estPower')} value={`${calculateEstimatedPower()}W`} />
            )}
            {activity.average_watts !== undefined && activity.average_watts > 0 && (
              <StatRow label={t('activityDetails.realAvgPower')} value={`${Math.round(activity.average_watts)}W`} />
            )}
            {activity.max_watts !== undefined && activity.max_watts > 0 && (
              <StatRow label={t('activityDetails.realMaxPower')} value={`${Math.round(activity.max_watts)}W`} />
            )}
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.stravaBtn} onPress={openInStrava} activeOpacity={0.7}>
            <Text style={styles.stravaBtnText}>{t('activityDetails.openInStrava')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze} activeOpacity={0.7}>
            <Text style={styles.analyzeBtnText}>{t('activityDetails.analyzeRide')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const StatRow: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View style={styles.statRow}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  map: {
    width: screenWidth,
    height: MAP_HEIGHT,
  },
  mapPlaceholder: {
    width: screenWidth,
    height: MAP_HEIGHT,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  date: {
    fontSize: 13,
    color: '#555',
    marginTop: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: '300',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroStats: {
    flexDirection: 'row',
    marginBottom: 28,
  },
  heroStat: {
    flex: 1,
  },
  heroValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
  },
  heroUnit: {
    fontSize: 11,
    color: '#555',
    fontWeight: '500',
    marginTop: 4,
  },
  secondaryBlock: {
    paddingBottom: 40,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  statLabel: {
    fontSize: 14,
    color: '#555',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 36,
   
  },
  stravaBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    alignItems: 'center',
    
  },
  stravaBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FC4C02',
  },
  analyzeBtn: {
    flex: 1,
    backgroundColor: '#274dd3',
    paddingVertical: 14,
    alignItems: 'center',
  },
  analyzeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
