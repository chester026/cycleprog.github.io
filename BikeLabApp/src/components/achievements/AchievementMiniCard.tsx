import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, Image, TouchableOpacity, StyleSheet, useWindowDimensions} from 'react-native';
import {Achievement} from './types';
import {formatBadgeValue} from './helpers';
import {useTheme, type Theme} from '../../theme';

function computeSizes(screenWidth: number) {
  const cardWidth = Math.max(140, Math.floor((screenWidth - 16) / 2.6));
  const medalSize = Math.min(cardWidth - 8, 170);
  return {cardWidth, medalSize};
}

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
  const theme = useTheme();
  const {width: screenWidth} = useWindowDimensions();
  const {cardWidth, medalSize} = computeSizes(screenWidth);
  const styles = React.useMemo(() => makeCardStyles(cardWidth, medalSize, theme), [cardWidth, medalSize, theme]);

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

// Built per render from the live window width (T-5.2/A-40-adjacent:
// useWindowDimensions instead of a Dimensions.get('window') snapshot taken
// once at module load, which never updated on rotation/split-screen).
function makeCardStyles(cardWidth: number, medalSize: number, theme: Theme) {
  return StyleSheet.create({
    card: {
      width: cardWidth,
      backgroundColor: 'transparent',
      paddingBottom: 24,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    medalContainer: {
      position: 'relative',
      width: medalSize,
      height: medalSize,
      marginBottom: medalSize * -0.24,
    },
    medalContainerGold: {
      width: medalSize,
      height: medalSize,
    },
    medal: {
      width: medalSize,
      height: medalSize,
      position: 'relative',
      left: medalSize * 0.09,
    },
    medalGold: {
      width: medalSize * 1.06,
      height: medalSize * 1.06,
      position: 'relative',
      left: medalSize * 0.03,
      top: medalSize * -0.04,
    },
    badgeOverlay: {
      position: 'absolute',
      top: medalSize * -0.32,
      left: -2,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    badgeValue: {
      fontSize: Math.max(18, medalSize * 0.19),
      fontWeight: '900',
      color: theme.colors.achievements.silverText,
      textAlign: 'center',
    },
    badgeValueRare: {
      color: theme.colors.text.inverse,
    },
    badgeValueGold: {
      fontSize: Math.max(20, medalSize * 0.17),
      color: theme.colors.achievements.goldText,
      marginTop: medalSize * -0.03,
    },
    badgeUnit: {
      fontSize: Math.max(8, medalSize * 0.07),
      fontWeight: '700',
      color: theme.colors.achievements.silverText,
      textAlign: 'center',
      marginTop: -2,
    },
    badgeUnitRare: {
      color: theme.colors.text.inverse,
    },
    badgeUnitGold: {
      fontSize: Math.max(8, medalSize * 0.065),
      color: theme.colors.achievements.goldText,
    },
    name: {
      fontSize: Math.max(13, cardWidth * 0.13),
      fontWeight: '900',
      color: theme.colors.text.primary,
      opacity: 0.2,
      textAlign: 'center',
      textTransform: 'uppercase',
      marginBottom: 8,
      letterSpacing: 0.2,
    },
    description: {
      fontSize: 12,
      fontWeight: '400',
      color: theme.colors.text.muted,
      textAlign: 'center',
      lineHeight: 16,
      display: 'none',
    },
    unlocked: {
      fontSize: 8,
      fontWeight: '800',
      color: theme.colors.text.inverse,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: theme.colors.successAlt,
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
      backgroundColor: theme.colors.divider,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.disabled,
    },
    progressText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text.muted,
    },
  });
}
