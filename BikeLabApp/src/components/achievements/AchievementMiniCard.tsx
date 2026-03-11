import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, Image, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {Achievement} from './types';
import {formatBadgeValue} from './helpers';

const {width: screenWidth} = Dimensions.get('window');
const CARD_WIDTH = Math.max(140, Math.floor((screenWidth - 16) / 2.6));
const MEDAL_SIZE = Math.min(CARD_WIDTH - 8, 170);

// Medal images
const MEDAL_IMAGES = {
  silver: require('../../assets/img/achieve/sh_silver.webp'),
  rare_steel: require('../../assets/img/achieve/sh_rare_steel.webp'),
  gold: require('../../assets/img/achieve/gold.webp'),
};

interface AchievementMiniCardProps {
  achievement: Achievement;
  onPress?: () => void;
}

/**
 * Compact Achievement Card component
 * Used in GarageScreen, RideAnalyticsScreen, etc.
 */
export const AchievementMiniCard: React.FC<AchievementMiniCardProps> = ({achievement, onPress}) => {
  const {t} = useTranslation();
  // Safety check
  if (!achievement) {
    return null;
  }

  const badge = formatBadgeValue(achievement.threshold, achievement.metric);
  const tier = achievement.tier || 'silver';
  const medalImage = MEDAL_IMAGES[tier as keyof typeof MEDAL_IMAGES] || MEDAL_IMAGES.silver;
  const progressPct = achievement.progress_pct || 0;

  const CardWrapper = onPress ? TouchableOpacity : View;
  const cardProps = onPress ? {onPress, activeOpacity: 0.7} : {};

  return (
    <CardWrapper style={styles.card} {...cardProps}>
      <View
        style={[
          styles.medalContainer,
          tier === 'gold' && styles.medalContainerGold,
        ]}>
        <Image
          source={medalImage}
          style={[styles.medal, tier === 'gold' && styles.medalGold]}
          resizeMode="contain"
        />
        <View style={styles.badgeOverlay}>
          <Text
            style={[
              styles.badgeValue,
              tier === 'rare_steel' && styles.badgeValueRare,
              tier === 'gold' && styles.badgeValueGold,
            ]}>
            {badge.value}
          </Text>
          <Text
            style={[
              styles.badgeUnit,
              tier === 'rare_steel' && styles.badgeUnitRare,
              tier === 'gold' && styles.badgeUnitGold,
            ]}>
            {badge.unit}
          </Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {achievement.name || t('achievements.title')}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {achievement.description || ''}
      </Text>
      {achievement.unlocked ? (
        <Text style={styles.unlocked}>{t('achievements.new')}</Text>
      ) : (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {width: `${progressPct}%`}]} />
          </View>
          <Text style={styles.progressText}>{progressPct.toFixed(0)}%</Text>
        </View>
      )}
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'transparent',
    paddingBottom: 24,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medalContainer: {
    position: 'relative',
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    marginBottom: MEDAL_SIZE * -0.24,
  },
  medalContainerGold: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
  },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    position: 'relative',
    left: MEDAL_SIZE * 0.09,
  },
  medalGold: {
    width: MEDAL_SIZE * 1.06,
    height: MEDAL_SIZE * 1.06,
    position: 'relative',
    left: MEDAL_SIZE * 0.03,
    top: MEDAL_SIZE * -0.04,
  },
  badgeOverlay: {
    position: 'absolute',
    top: MEDAL_SIZE * -0.32,
    left: -2,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeValue: {
    fontSize: Math.max(18, MEDAL_SIZE * 0.19),
    fontWeight: '900',
    color: '#6A6A6A',
    textAlign: 'center',
  },
  badgeValueRare: {
    color: '#fff',
  },
  badgeValueGold: {
    fontSize: Math.max(20, MEDAL_SIZE * 0.17),
    color: '#5a4a3a',
    marginTop: MEDAL_SIZE * -0.03,
  },
  badgeUnit: {
    fontSize: Math.max(8, MEDAL_SIZE * 0.07),
    fontWeight: '700',
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitRare: {
    color: '#fff',
  },
  badgeUnitGold: {
    fontSize: Math.max(8, MEDAL_SIZE * 0.065),
    color: '#5a4a3a',
  },
  name: {
    fontSize: Math.max(13, CARD_WIDTH * 0.13),
    fontWeight: '900',
    color: '#1a1a1a',
    opacity: 0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888',
    textAlign: 'center',
   
  
    lineHeight: 16,
    display: 'none',
  },
  unlocked: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    textTransform: 'uppercase',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: 0,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#f0f0f0',
   
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ccc',
   
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
});
