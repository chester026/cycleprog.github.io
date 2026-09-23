import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, Image, ViewStyle, TextStyle, ImageStyle} from 'react-native';
import {Achievement} from './types';
import {formatBadgeValue, formatProgressValue} from './helpers';
import {makeStyles} from '../../theme';

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
  const {t} = useTranslation();
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
          {isUnlocked ? t('achievements.checkUnlocked') : `${progressValue} / ${badge.value}${badge.unit ? ' ' + badge.unit : ''}`}
        </Text>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  achievementCard: {
    flex: 1,
    margin: 2,
    marginBottom: -6,
    backgroundColor: theme.colors.surfaceElevated,
    padding: 12,
    alignItems: 'center',
    shadowColor: theme.colors.black,
   borderWidth: 1,
   borderColor: theme.colors.border,
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
    color: theme.colors.achievements.silverText,
    textAlign: 'center',
  },
  badgeValueRareSteel: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.colors.text.inverse,
    textAlign: 'center',
    marginTop: -4,
  },
  badgeValueGold: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.colors.achievements.goldText,
    textAlign: 'center',
    marginTop: -10,
  },
  badgeValueLocked: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.colors.disabled,
    textAlign: 'center',
  },
  badgeUnitSilver: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.achievements.silverText,
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitRareSteel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    textAlign: 'center',
    marginTop: -2,
  },
  badgeUnitGold: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.achievements.goldText,
    textAlign: 'center',
    marginTop: -4,
  },
  badgeUnitLocked: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.disabled,
    textAlign: 'center',
    marginTop: -2,
  },
  achievementName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.muted,
    textAlign: 'center',
    marginBottom: 6,
  },
  achievementNameUnlocked: {
    color: theme.colors.text.primary,
  },
  achievementDescription: {
    fontSize: 10,
    color: theme.colors.text.muted,
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
    backgroundColor: theme.colors.divider,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.disabled,
  },
  progressFillUnlocked: {
    backgroundColor: theme.colors.successAlt,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.text.muted,
    textAlign: 'center',
  },
}));
