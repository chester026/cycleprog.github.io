import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Video from 'react-native-video';
import {BlurView} from '@react-native-community/blur';
import {StatsCard} from './StatsCard';
import type {Activity} from '../types/activity';

interface VideoHeaderWithStatsProps {
  selectedYear: number | 'all';
  getYearLabel: () => string;
  onYearPress: () => void;
  filteredActivities: Activity[];
  fromCache?: boolean;
}

export const VideoHeaderWithStats: React.FC<VideoHeaderWithStatsProps> = ({
  selectedYear,
  getYearLabel,
  onYearPress,
  filteredActivities,
  fromCache,
}) => {
  return (
    <View style={styles.container}>
      {/* Background Video */}
      <Video
        source={require('../assets/bgvid.mp4')}
        style={styles.backgroundVideo}
        resizeMode="cover"
        repeat
        muted
        playInBackground={false}
        playWhenInactive={false}
        ignoreSilentSwitch="ignore"
      />

      {/* Blur Effect */}
      <BlurView
        style={styles.blurView}
        blurType="dark"
        blurAmount={15}
        reducedTransparencyFallbackColor="#0a0a0a"
      />

      {/* Dark Overlay */}
      <View style={styles.overlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Activities</Text>
            {fromCache && <Text style={styles.cacheIndicator}>📦</Text>}
          </View>

          {/* Year Picker Button */}
          {filteredActivities.length > 0 && (
            <TouchableOpacity style={styles.yearButton} onPress={onYearPress}>
              <Text style={styles.yearButtonText}>{getYearLabel()}</Text>
              <Text style={styles.yearButtonArrow}>▼</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Card */}
        {filteredActivities.length > 0 && (
          <StatsCard activities={filteredActivities} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.03)', // темный оверлей 40%
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 16
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  cacheIndicator: {
    fontSize: 14,
    marginTop: 4,
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 26, 0)',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(42, 42, 42, 0)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  yearButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  yearButtonArrow: {
    fontSize: 10,
    color: '#888',
  },
});

