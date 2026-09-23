// Hero banner at the top of the Garage screen: last-ride map + headline +
// distance/speed/elevation stats + share/analyze actions. Extracted from
// GarageScreen.tsx (T-5.4, audit A-27) — purely presentational, all the
// data it needs (the ride, its decoded track, the map's bounding region)
// is computed once in the screen via `./lib.ts` and passed down.
import React, {useRef, useCallback} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import {ShareIcon} from '../../assets/img/icons/ShareIcon';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import type {Activity} from '../../types/activity';
import {formatRideDate, type LatLng, type MapRegion} from './lib';

export interface LastRideHeroProps {
  lastRide: Activity | null;
  trackCoordinates: LatLng[];
  mapRegion: MapRegion | null;
  onShare: () => void;
  onAnalyze: () => void;
}

export const LastRideHero: React.FC<LastRideHeroProps> = ({
  lastRide,
  trackCoordinates,
  mapRegion,
  onShare,
  onAnalyze,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  const handleMapReady = useCallback(() => {
    if (mapRef.current && trackCoordinates.length > 0) {
      mapRef.current.fitToCoordinates(trackCoordinates, {
        edgePadding: {top: 60, right: 40, bottom: 60, left: 40},
        animated: false,
      });
    }
  }, [trackCoordinates]);

  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  const elevation = lastRide?.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) : '—';

  return (
    <View>
      <View style={styles.hero}>
        {trackCoordinates.length > 0 ? (
          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.heroMapBackground}
              provider={PROVIDER_DEFAULT}
              initialRegion={mapRegion!}
              onMapReady={handleMapReady}
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
              mapType="mutedStandard">
              <Polyline
                coordinates={trackCoordinates}
                strokeWidth={3}
                strokeColor={theme.colors.text.inverse}
                lineCap="round"
                lineJoin="round"
              />
            </MapView>
          </View>
        ) : (
          <View style={styles.heroMapBackground}>
            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapPlaceholderText}>{t('garage.noTrackData')}</Text>
            </View>
          </View>
        )}

        <View style={styles.heroOverlay} />

        <LinearGradient
          colors={[theme.colors.lastRideHero.gradientTop, theme.colors.lastRideHero.gradientBottom]}
          locations={[0, 1]}
          style={styles.heroContentGradient}
        />
      </View>

      <View style={styles.heroContent}>
        <View style={styles.heroHeader}>
          <View style={styles.heroHeaderText}>
            <Text style={styles.heroDate}>{formatRideDate(lastRide?.start_date)}</Text>
            <Text style={styles.heroTitle}>{lastRide?.name || t('garage.lastRideTrack')}</Text>
          </View>
          {lastRide ? <TouchableOpacity style={styles.shareIconButton} onPress={onShare}>
              <ShareIcon size={22} color={theme.colors.text.inverse} />
            </TouchableOpacity> : null}
        </View>

        <View style={styles.statsCards}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              {t('common.distance')}<Text style={styles.statUnit}>{t('garage.distanceUnitSuffix')}</Text>
            </Text>
            <Text style={styles.statValue}>{distance}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              {t('common.avgSpeed')}<Text style={styles.statUnit}>{t('garage.avgSpeedUnitSuffix')}</Text>
            </Text>
            <Text style={styles.statValue}>{speed}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              {t('common.elevation')}<Text style={styles.statUnit}>{t('garage.elevationUnitSuffix')}</Text>
            </Text>
            <Text style={styles.statValue}>{elevation}</Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.analyzeButton} onPress={onAnalyze} disabled={!lastRide}>
            <Text style={[styles.analyzeButtonText, !lastRide && styles.analyzeButtonTextDisabled]}>
              {t('garage.analyzeRide')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  hero: {
    height: 350,
    position: 'relative',
    backgroundColor: theme.colors.background,
    marginHorizontal: theme.spacing[8],
    marginTop: '14%',
    borderRadius: 40,
  },
  mapWrapper: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    borderTopRightRadius: 40,
    borderTopLeftRadius: 40,
    overflow: 'hidden',
  },
  heroMapBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    borderTopRightRadius: 40,
    borderTopLeftRadius: 40,
    overflow: 'hidden',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.lastRideHero.dimOverlay,
    zIndex: 1,
    borderTopRightRadius: 40,
    borderTopLeftRadius: 40,
    overflow: 'hidden',
  },
  heroContent: {
    flex: 1,
    backgroundColor: theme.colors.ink,
    padding: theme.spacing[20],
    paddingTop: theme.spacing[32],
    paddingBottom: theme.spacing[24],
    marginHorizontal: theme.spacing[8],
    zIndex: 10,
    justifyContent: 'flex-end',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 25, height: 20},
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 3,
  },
  heroContentGradient: {
    width: '100%',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    marginHorizontal: theme.spacing[16],
  },
  mapPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  mapPlaceholderText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSize.base,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[16],
  },
  heroHeaderText: {
    flex: 1,
  },
  shareIconButton: {
    width: 45,
    height: 45,
    borderRadius: 80, // not in the radii scale yet — kept literal
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.07),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.text.inverse, 0),
    marginLeft: theme.spacing[12],
    marginTop: -12,
  },
  heroTitle: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[12],
    lineHeight: 30,
  },
  heroDate: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: withOpacity(theme.colors.text.inverse, 0.6),
    marginBottom: 0,
  },
  statsCards: {
    flexDirection: 'row',
    gap: theme.spacing[12],
  },
  statCard: {
    flex: 1,
    padding: 0,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.placeholder,
    marginBottom: theme.spacing[8],
  },
  statUnit: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: theme.colors.text.inverse,
  },
  actionButtons: {
    flexDirection: 'column',
    gap: theme.spacing[12],
    marginTop: theme.spacing[32],
  },
  analyzeButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[20],
    borderRadius: theme.radii.pill,
    // Not theme.shadows.buttonPrimary — this button's shadow is a
    // one-off (bigger blur/offset) that doesn't match that preset.
    shadowColor: theme.colors.accent,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 6,
  },
  analyzeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 15, // not in the typography scale yet — kept literal
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: theme.typography.letterSpacing.wide,
  },
  analyzeButtonTextDisabled: {
    opacity: 0.5,
  },
}));
