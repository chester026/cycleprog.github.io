import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, Dimensions} from 'react-native';
import {Achievement} from './types';
import {formatBadgeValue} from './helpers';

const {width: screenWidth} = Dimensions.get('window');

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
        {achievement.name || 'Achievement'}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {achievement.description || ''}
      </Text>
      {achievement.unlocked ? (
        <Text style={styles.unlocked}>NEW</Text>
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
    width: (screenWidth - 278),
    backgroundColor: 'transparent',
    paddingBottom: 32,
    paddingHorizontal: 12,
   
    alignItems: 'center',
   
    justifyContent: 'space-between',
  },
  medalContainer: {
    position: 'relative',
    width: 180,
    height: 180,
    marginBottom: -44,
  },
  medalContainerGold: {
    width: 180,
    height: 180,
  },
  medal: {
    width: 180,
    height: 180,
    position: 'relative',
    left: 17,
    
   
  },
  medalGold: {
    width: 190,
    height: 190,
    position: 'relative',
    left: 5,
    top: -8,
  },
  badgeOverlay: {
    position: 'absolute',
    top: -58,
    left: -2,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    
  },
  badgeValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#6A6A6A',
    textAlign: 'center',
  },
  badgeValueRare: {
    color: '#fff',
  },
  badgeValueGold: {
    fontSize: 26,
    color: '#5a4a3a',
    marginTop: -6,
  },
  badgeUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitRare: {
    color: '#fff',
  },
  badgeUnitGold: {
    fontSize: 10,
    color: '#5a4a3a',
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a1a',
    opacity: 0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 12,
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
