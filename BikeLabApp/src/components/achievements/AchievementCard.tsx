import React from 'react';
import {View, Text, Image, StyleSheet, ViewStyle, TextStyle, ImageStyle} from 'react-native';
import {Achievement} from './types';
import {formatBadgeValue, formatProgressValue} from './helpers';

// Medal images
const MEDAL_IMAGES = {
  silver: require('../../assets/img/achieve/silver.webp'),
  rare_steel: require('../../assets/img/achieve/rare_steel.webp'),
  gold: require('../../assets/img/achieve/gold.webp'),
};

interface AchievementCardProps {
  achievement: Achievement;
  containerStyle?: ViewStyle;
}

/**
 * Full Achievement Card component
 * Used in AchievementsScreen
 */
export const AchievementCard: React.FC<AchievementCardProps> = ({achievement, containerStyle}) => {
  const badge = formatBadgeValue(achievement.threshold, achievement.metric);
  const progressValue = formatProgressValue(achievement.current_value, achievement.metric);
  const progressPct = Math.min(100, achievement.progress_pct);
  const isUnlocked = achievement.unlocked;
  const tier = achievement.tier;

  // Tier-specific badge styles
  const getBadgeValueStyle = (): TextStyle => {
    if (!isUnlocked) return styles.badgeValueLocked;
    switch (tier) {
      case 'silver':
        return styles.badgeValueSilver;
      case 'rare_steel':
        return styles.badgeValueRareSteel;
      case 'gold':
        return styles.badgeValueGold;
      default:
        return styles.badgeValueSilver;
    }
  };

  const getBadgeUnitStyle = (): TextStyle => {
    if (!isUnlocked) return styles.badgeUnitLocked;
    switch (tier) {
      case 'silver':
        return styles.badgeUnitSilver;
      case 'rare_steel':
        return styles.badgeUnitRareSteel;
      case 'gold':
        return styles.badgeUnitGold;
      default:
        return styles.badgeUnitSilver;
    }
  };

  const getMedalImageStyle = (): ImageStyle[] => {
    const base = !isUnlocked ? styles.medalImageLocked : undefined;
    switch (tier) {
      case 'silver':
        return [styles.medalImageSilver, base].filter(Boolean) as ImageStyle[];
      case 'rare_steel':
        return [styles.medalImageRareSteel, base].filter(Boolean) as ImageStyle[];
      case 'gold':
        return [styles.medalImageGold, base].filter(Boolean) as ImageStyle[];
      default:
        return [styles.medalImageSilver, base].filter(Boolean) as ImageStyle[];
    }
  };

  return (
    <View style={[styles.achievementCard, containerStyle]}>
      {/* Medal with Badge */}
      <View style={styles.medalContainer}>
        <Image
          source={MEDAL_IMAGES[achievement.tier as keyof typeof MEDAL_IMAGES]}
          style={getMedalImageStyle()}
        />
        <View style={styles.badgeOverlay}>
          <Text style={getBadgeValueStyle()}>{badge.value}</Text>
          <Text style={getBadgeUnitStyle()}>{badge.unit}</Text>
        </View>
      </View>

      {/* Title & Description */}
      <Text style={[styles.achievementName, isUnlocked && styles.achievementNameUnlocked]}>
        {achievement.name}
      </Text>
      <Text style={styles.achievementDescription}>{achievement.description}</Text>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {width: `${progressPct}%`},
              isUnlocked && styles.progressFillUnlocked,
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {isUnlocked ? '✓ Unlocked' : `${progressValue} / ${badge.value}${badge.unit ? ' ' + badge.unit : ''}`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  achievementCard: {
    flex: 1,
    margin: 2,
    marginBottom: -6,
    backgroundColor: '#fff',
    
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
   borderWidth: 1,
   borderColor: '#ECECEC',
    minHeight: 200,
  },
  medalContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  medalImageSilver: {
    width: 105,
    height: 105,
  },
  medalImageRareSteel: {
    width: 100,
    height: 100,
    marginBottom: 4,
  },
  medalImageGold: {
    width: 130,
    height: 130,
    marginBottom: -30,
    position: 'relative',
    left: 8,
    top: 2,
  },
  medalImageLocked: {
    opacity: 0,
  },
  badgeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeValueSilver: {
    fontSize: 26,
    fontWeight: '900',
    color: '#6A6A6A',
    textAlign: 'center',
  },
  badgeValueRareSteel: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginTop: -4,
  },
  badgeValueGold: {
    fontSize: 26,
    fontWeight: '900',
    color: '#5a4a3a',
    textAlign: 'center',
    marginTop: -10,
  },
  badgeValueLocked: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ccc',
    textAlign: 'center',
  },
  badgeUnitSilver: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitRareSteel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitGold: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5a4a3a',
    textAlign: 'center',
    marginTop: -4,
  },
  badgeUnitLocked: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ccc',
    textAlign: 'center',
    marginTop: -2,
  },
  achievementName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textAlign: 'center',
    marginBottom: 6,
  },
  achievementNameUnlocked: {
    color: '#1a1a1a',
  },
  achievementDescription: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 15,
  },
  progressSection: {
    width: '100%',
    marginTop: 'auto',
  },
  progressBar: {
    width: '100%',
    height: 5,
    backgroundColor: '#f0f0f0',
   
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ccc',
    
  },
  progressFillUnlocked: {
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888',
    textAlign: 'center',
  },
});
