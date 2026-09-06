import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {BlurView} from '@react-native-community/blur';
import BlobOrb from './BlobOrb';
import {StatsCard} from './StatsCard';
import type {Activity} from '../types/activity';

interface VideoHeaderWithStatsProps {
  selectedYear: number | 'all';
  getYearLabel: () => string;
  onYearPress: () => void;
  filteredActivities: Activity[];
  fromCache?: boolean;
}

// Despite the (now stale) filename, this no longer plays a background video
// — restyled to match the AI Coach home's soft blob/blur backdrop (see
// heroBackground/BlobOrbContainer/BlurView in CoachChatScreen.tsx) instead
// of the old dark bgvid.mp4 + dark blur look. The year picker now sits
// where Coach's "AI Coach / Goals" segmented control sits (there's only
// one thing to switch here, so a single pill button takes that slot),
// followed by a big headline and the stats row underneath — same
// greeting -> headline -> stats shape as CoachHomeHero, just without a
// subtitle/prompt input since this screen doesn't need one.
export const VideoHeaderWithStats: React.FC<VideoHeaderWithStatsProps> = ({
  selectedYear: _selectedYear,
  getYearLabel,
  onYearPress,
  filteredActivities,
  fromCache,
}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.container}>
      {/* Blob + blur backdrop — same recipe as the Coach home hero */}
      <View style={styles.blobBackground} pointerEvents="none">
        <View style={styles.blobOrbContainer}>
          <BlobOrb size={450} />
        </View>
        <BlurView
          blurType="light"
          blurAmount={25}
          style={StyleSheet.absoluteFill}
          reducedTransparencyFallbackColor="rgba(250, 250, 250, 0.9)"
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Year picker — where the tab switcher sits on the Coach home */}
        <View style={styles.header}>
          {filteredActivities.length > 0 ? (
            <TouchableOpacity style={styles.yearButton} onPress={onYearPress}>
              <Text style={styles.yearButtonText}>{getYearLabel()}</Text>
              <Text style={styles.yearButtonArrow}>▼</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          {fromCache && <Text style={styles.cacheIndicator}>📦</Text>}
        </View>

        <Text style={styles.headline}>
          {t('videoHeader.headlineBefore')}
          <Text style={styles.highlightWord}> {t('videoHeader.headlineHighlight')} </Text>
          {t('videoHeader.headlineAfter')}
        </Text>
        <Text style={styles.subtitle}>{t('videoHeader.subtitle')}</Text>

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
  blobBackground: {
    ...StyleSheet.absoluteFillObject,
    height: 320,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blobOrbContainer: {
    position: 'absolute',
    top: -250,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 28,
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
  },
  yearButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  yearButtonArrow: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.45)',
  },
  cacheIndicator: {
    fontSize: 14,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 36,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  highlightWord: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: '#274dd3',
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
});
