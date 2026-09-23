/**
 * RouteMap - the map-or-placeholder background used by Template B, split
 * out of `TemplateB.tsx` (T-5.4). Only B uses a map, but it was ~45 lines
 * of MapView/region-fitting logic tangled into the template's background
 * switch; pulling it out here makes both pieces easier to read and test.
 */
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import {TEMPLATE_WIDTH, TEMPLATE_HEIGHT, MapStyle} from '../types';
import {makeStyles, useTheme} from '../../../theme';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RouteMapProps {
  trackCoordinates: Coordinate[];
  mapStyle: MapStyle;
}

function getMapRegion(trackCoordinates: Coordinate[]) {
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
}

/** Renders the ride's track on a muted map, or a "no route data" placeholder. */
export const RouteMap: React.FC<RouteMapProps> = ({trackCoordinates, mapStyle}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const isDarkMap = mapStyle === 'dark';

  if (trackCoordinates.length === 0) {
    return (
      <View style={[styles.fullBackground, styles.placeholder]}>
        <Text style={styles.placeholderText}>{t('shareStudio.noRouteData')}</Text>
      </View>
    );
  }

  return (
    <MapView
      style={styles.fullBackground}
      provider={PROVIDER_DEFAULT}
      region={getMapRegion(trackCoordinates)}
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
        strokeColor={isDarkMap ? theme.colors.text.inverse : theme.colors.accent}
        lineCap="round"
        lineJoin="round"
      />
    </MapView>
  );
};

const styles = makeStyles(theme => ({
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.share.templateB.mapPlaceholderBg,
  },
  placeholderText: {
    color: theme.colors.share.templateB.mapPlaceholderText,
    fontSize: 32,
    fontWeight: '600',
  },
}));
